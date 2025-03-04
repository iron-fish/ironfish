/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::{IronfishError, IronfishErrorKind},
    merkle_note::MerkleNote,
};
use blstrs::{Bls12, Scalar};
use ff::Field;
use group::Curve;
use ironfish_bellperson::groth16;
use ironfish_jubjub::ExtendedPoint;
use ironfish_zkp::redjubjub;
use std::io;

#[cfg(feature = "transaction-proofs")]
use super::verify::verify_output_proof;
#[cfg(feature = "transaction-proofs")]
use crate::{keys::EphemeralKeyPair, note::Note, sapling_bls12::SAPLING, OutgoingViewKey};
#[cfg(feature = "transaction-proofs")]
use ironfish_zkp::{primitives::ValueCommitment, proofs::Output, ProofGenerationKey};
#[cfg(feature = "transaction-proofs")]
use rand::thread_rng;

/// Parameters used when constructing proof that a new note exists. The owner
/// of this note is the recipient of funds in a transaction. The note is signed
/// with the owners public key so only they can read it.
#[cfg(feature = "transaction-proofs")]
pub struct OutputBuilder {
    pub(crate) note: Note,

    /// Randomized value commitment. Sometimes referred to as
    /// `cv` in the literature. It's calculated by multiplying a value by a
    /// random number. Randomized to help maintain zero knowledge.
    pub(crate) value_commitment: ValueCommitment,

    /// Flag to determine if the output to build is used for a miner's fee
    /// transaction. Not used directly here, but passed down into the
    /// [`MerkleNote`].
    is_miners_fee: bool,
}

pub const PROOF_SIZE: u32 = 192;

#[cfg(feature = "transaction-proofs")]
impl OutputBuilder {
    /// Create a new [`OutputBuilder`] attempting to create a note.
    pub(crate) fn new(note: Note) -> Self {
        let value_commitment = ValueCommitment::new(note.value, note.asset_generator());

        Self {
            note,
            value_commitment,
            is_miners_fee: false,
        }
    }

    /// Sets the `is_miners_fee` flag to true, indicating that this output is to
    /// be used for a miner's fee transaction.
    pub(crate) fn set_is_miners_fee(&mut self) {
        self.is_miners_fee = true;
    }

    pub(crate) fn get_is_miners_fee(&self) -> bool {
        self.is_miners_fee
    }

    /// Get the value_commitment from this proof as an edwards Point.
    ///
    /// This integrates the value and randomness into a single point, using an
    /// appropriate generator.
    pub(crate) fn value_commitment_point(&self) -> ExtendedPoint {
        ExtendedPoint::from(self.value_commitment.commitment())
    }

    pub fn build_circuit(
        &self,
        proof_generation_key: &ProofGenerationKey,
        public_key_randomness: &ironfish_jubjub::Fr,
    ) -> (Output, EphemeralKeyPair) {
        let key_pair = EphemeralKeyPair::new();
        let circuit = Output {
            value_commitment: Some(self.value_commitment.clone()),
            payment_address: Some(self.note.owner.0),
            commitment_randomness: Some(self.note.randomness),
            esk: Some(*key_pair.secret()),
            asset_id: *self.note.asset_id().as_bytes(),
            proof_generation_key: Some(proof_generation_key.clone()),
            ar: Some(*public_key_randomness),
        };
        (circuit, key_pair)
    }

    /// Construct and return the committed [`OutputDescription`] for this receiving calculation.
    ///
    /// The [`OutputDescription`] is the publicly visible form of the new note, not
    /// including any keys or intermediate working values.
    ///
    /// Verifies the proof before returning to prevent posting broken
    /// transactions.
    pub fn build(
        &self,
        proof_generation_key: &ProofGenerationKey,
        outgoing_view_key: &OutgoingViewKey,
        public_key_randomness: &ironfish_jubjub::Fr,
        randomized_public_key: &redjubjub::PublicKey,
    ) -> Result<OutputDescription, IronfishError> {
        let (circuit, diffie_hellman_keys) =
            self.build_circuit(proof_generation_key, public_key_randomness);

        let proof =
            groth16::create_random_proof(circuit, &SAPLING.output_params, &mut thread_rng())?;
        let merkle_note = if self.is_miners_fee {
            MerkleNote::new_for_miners_fee(&self.note, &self.value_commitment, &diffie_hellman_keys)
        } else {
            MerkleNote::new(
                outgoing_view_key,
                &self.note,
                &self.value_commitment,
                &diffie_hellman_keys,
            )
        };

        let description = OutputDescription { proof, merkle_note };
        description.partial_verify()?;

        verify_output_proof(
            &description.proof,
            &description.public_inputs(randomized_public_key),
        )?;

        Ok(description)
    }
}

/// The publicly visible values of a received note in a transaction. These
/// values are calculated by the spender using only the public address of the
/// owner of this new note.
///
/// This is the variation of an Output that gets serialized to bytes and can
/// be loaded from bytes.
#[derive(Clone, PartialEq, Debug)]
pub struct OutputDescription {
    /// Proof that the output circuit was valid and successful
    pub(crate) proof: groth16::Proof<Bls12>,

    /// Merkle note containing all the values verified by the proof. These values
    /// are shared on the blockchain and can be snapshotted into a Merkle Tree
    pub(crate) merkle_note: MerkleNote,
}

impl OutputDescription {
    /// Load an [`OutputDescription`] from a Read implementation( e.g: socket, file)
    /// This is the main entry-point when reconstructing a serialized
    /// transaction.
    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let proof = groth16::Proof::read(&mut reader)?;
        let merkle_note = MerkleNote::read(&mut reader)?;

        Ok(OutputDescription { proof, merkle_note })
    }

    /// Stow the bytes of this [`OutputDescription`] in the given writer.
    pub fn write<W: io::Write>(&self, writer: W) -> Result<(), IronfishError> {
        self.serialize_signature_fields(writer)
    }

    /// A function to encapsulate any verification besides the proof itself.
    /// This allows us to abstract away the details and make it easier to work
    /// with. Note that this does not verify the proof, that happens in the
    /// [`OutputBuilder`] build function as the prover, and in
    /// [`super::batch_verify_transactions`] as the verifier.
    pub fn partial_verify(&self) -> Result<(), IronfishError> {
        self.verify_not_small_order()?;

        Ok(())
    }

    fn verify_not_small_order(&self) -> Result<(), IronfishError> {
        if self.merkle_note.value_commitment.is_small_order().into()
            || ExtendedPoint::from(self.merkle_note.ephemeral_public_key)
                .is_small_order()
                .into()
        {
            return Err(IronfishError::new(IronfishErrorKind::IsSmallOrder));
        }

        Ok(())
    }

    /// Converts the values to appropriate inputs for verifying the bellperson proof.
    /// Demonstrates knowledge of a note containing the sender's randomized public key,
    /// value_commitment, public_key, and note_commitment
    pub fn public_inputs(&self, randomized_public_key: &redjubjub::PublicKey) -> [Scalar; 7] {
        let mut public_inputs = [Scalar::zero(); 7];
        let p = randomized_public_key.0.to_affine();
        public_inputs[0] = p.get_u();
        public_inputs[1] = p.get_v();

        let p = self.merkle_note.value_commitment.to_affine();
        public_inputs[2] = p.get_u();
        public_inputs[3] = p.get_v();

        let p = ExtendedPoint::from(self.merkle_note.ephemeral_public_key).to_affine();
        public_inputs[4] = p.get_u();
        public_inputs[5] = p.get_v();

        public_inputs[6] = self.merkle_note.note_commitment;

        public_inputs
    }

    /// Get a MerkleNote, which can be used as a node in a Merkle Tree.
    pub fn merkle_note(&self) -> MerkleNote {
        self.merkle_note.clone()
    }

    /// Write the signature of this proof to the provided writer.
    ///
    /// The signature is used by the transaction to calculate the signature
    /// hash. Having this data essentially binds the note to the transaction,
    /// proving that it is actually part of that transaction.
    /// randomized_public_key is available in Transaction level, so not needed in descriptions
    pub(crate) fn serialize_signature_fields<W: io::Write>(
        &self,
        mut writer: W,
    ) -> Result<(), IronfishError> {
        self.proof.write(&mut writer)?;
        self.merkle_note.write(&mut writer)?;

        Ok(())
    }
}

#[cfg(test)]
#[cfg(feature = "transaction-proofs")]
mod test {
    use super::{OutputBuilder, OutputDescription};
    use crate::{
        assets::asset_identifier::NATIVE_ASSET, keys::SaplingKey,
        merkle_note::NOTE_ENCRYPTION_MINER_KEYS, note::Note,
        transaction::verify::verify_output_proof,
    };
    use ff::{Field, PrimeField};
    use group::Curve;
    use ironfish_jubjub::ExtendedPoint;
    use ironfish_zkp::{constants::SPENDING_KEY_GENERATOR, redjubjub};
    use rand::thread_rng;

    #[test]
    /// Test to confirm that creating an output with the `is_miners_fee` flag
    /// set will use the hard-coded note encryption keys
    fn test_output_miners_fee() {
        let spender_key = SaplingKey::generate_key();
        let public_key_randomness = ironfish_jubjub::Fr::random(thread_rng());
        let randomized_public_key =
            redjubjub::PublicKey(spender_key.view_key.authorizing_key.into())
                .randomize(public_key_randomness, *SPENDING_KEY_GENERATOR);

        let note = Note::new(
            spender_key.public_address(),
            42,
            "",
            NATIVE_ASSET,
            spender_key.public_address(),
        );

        let mut output = OutputBuilder::new(note);
        output.set_is_miners_fee();

        let proof = output
            .build(
                &spender_key.sapling_proof_generation_key(),
                spender_key.outgoing_view_key(),
                &public_key_randomness,
                &randomized_public_key,
            )
            .expect("should be able to build output proof");

        assert_eq!(
            &proof.merkle_note.note_encryption_keys,
            NOTE_ENCRYPTION_MINER_KEYS,
        );
    }

    #[test]
    fn test_output_not_miners_fee() {
        let spender_key = SaplingKey::generate_key();
        let receiver_key = SaplingKey::generate_key();
        let public_key_randomness = ironfish_jubjub::Fr::random(thread_rng());
        let randomized_public_key =
            redjubjub::PublicKey(spender_key.view_key.authorizing_key.into())
                .randomize(public_key_randomness, *SPENDING_KEY_GENERATOR);

        let note = Note::new(
            receiver_key.public_address(),
            42,
            "",
            NATIVE_ASSET,
            spender_key.public_address(),
        );

        let output = OutputBuilder::new(note);
        let proof = output
            .build(
                &spender_key.sapling_proof_generation_key(),
                spender_key.outgoing_view_key(),
                &public_key_randomness,
                &randomized_public_key,
            )
            .expect("should be able to build output proof");

        assert_ne!(
            &proof.merkle_note.note_encryption_keys,
            NOTE_ENCRYPTION_MINER_KEYS
        );
    }

    #[test]
    fn test_output_builder() {
        let spender_key = SaplingKey::generate_key();
        let receiver_key = SaplingKey::generate_key();

        let public_key_randomness = ironfish_jubjub::Fr::random(thread_rng());
        let randomized_public_key =
            redjubjub::PublicKey(spender_key.view_key.authorizing_key.into())
                .randomize(public_key_randomness, *SPENDING_KEY_GENERATOR);

        let other_public_key_randomness = ironfish_jubjub::Fr::random(thread_rng());
        let other_randomized_public_key =
            redjubjub::PublicKey(receiver_key.view_key.authorizing_key.into())
                .randomize(other_public_key_randomness, *SPENDING_KEY_GENERATOR);

        let note = Note::new(
            receiver_key.public_address(),
            42,
            "",
            NATIVE_ASSET,
            spender_key.public_address(),
        );

        let output = OutputBuilder::new(note);
        let description = output
            .build(
                &spender_key.sapling_proof_generation_key(),
                spender_key.outgoing_view_key(),
                &public_key_randomness,
                &randomized_public_key,
            )
            .expect("should be able to build output proof");

        verify_output_proof(
            &description.proof,
            &description.public_inputs(&randomized_public_key),
        )
        .expect("should be able to verify proof");

        // Wrong spender key
        assert!(output
            .build(
                &receiver_key.sapling_proof_generation_key(),
                receiver_key.outgoing_view_key(),
                &public_key_randomness,
                &randomized_public_key
            )
            .is_err());

        // Wrong public key randomness
        assert!(output
            .build(
                &spender_key.sapling_proof_generation_key(),
                spender_key.outgoing_view_key(),
                &other_public_key_randomness,
                &randomized_public_key
            )
            .is_err());

        // Wrong randomized public key
        assert!(output
            .build(
                &spender_key.sapling_proof_generation_key(),
                spender_key.outgoing_view_key(),
                &public_key_randomness,
                &other_randomized_public_key
            )
            .is_err());

        assert!(verify_output_proof(
            &description.proof,
            &description.public_inputs(&other_randomized_public_key),
        )
        .is_err());
    }

    #[test]
    fn test_output_round_trip() {
        let spender_key = SaplingKey::generate_key();
        let receiver_key = SaplingKey::generate_key();
        let public_key_randomness = ironfish_jubjub::Fr::random(thread_rng());
        let randomized_public_key =
            redjubjub::PublicKey(spender_key.view_key.authorizing_key.into())
                .randomize(public_key_randomness, *SPENDING_KEY_GENERATOR);

        let note = Note::new(
            receiver_key.public_address(),
            42,
            "",
            NATIVE_ASSET,
            spender_key.public_address(),
        );

        let output = OutputBuilder::new(note);
        let proof = output
            .build(
                &spender_key.sapling_proof_generation_key(),
                spender_key.outgoing_view_key(),
                &public_key_randomness,
                &randomized_public_key,
            )
            .expect("Should be able to build output proof");
        verify_output_proof(&proof.proof, &proof.public_inputs(&randomized_public_key))
            .expect("proof should check out");

        // test serialization
        let mut serialized_proof = vec![];
        proof
            .write(&mut serialized_proof)
            .expect("Should be able to serialize proof");
        let read_back_proof: OutputDescription =
            OutputDescription::read(&mut serialized_proof[..].as_ref())
                .expect("Should be able to deserialize valid proof");

        assert_eq!(proof.proof.a, read_back_proof.proof.a);
        assert_eq!(proof.proof.b, read_back_proof.proof.b);
        assert_eq!(proof.proof.c, read_back_proof.proof.c);
        assert_eq!(
            proof.merkle_note.value_commitment.to_affine(),
            read_back_proof.merkle_note.value_commitment.to_affine()
        );
        assert_eq!(
            proof.merkle_note.note_commitment.to_repr(),
            read_back_proof.merkle_note.note_commitment.to_repr()
        );
        assert_eq!(
            ExtendedPoint::from(proof.merkle_note.ephemeral_public_key).to_affine(),
            ExtendedPoint::from(read_back_proof.merkle_note.ephemeral_public_key).to_affine()
        );
        assert_eq!(
            proof.merkle_note.encrypted_note[..],
            read_back_proof.merkle_note.encrypted_note[..]
        );
        assert_eq!(
            proof.merkle_note.note_encryption_keys[..],
            read_back_proof.merkle_note.note_encryption_keys[..]
        );

        let mut serialized_again = vec![];
        read_back_proof
            .write(&mut serialized_again)
            .expect("should be able to serialize proof again");
        assert_eq!(serialized_proof, serialized_again);
    }
}
