/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{errors::IronfishError, sapling_bls12::SAPLING};

use super::{keys::SaplingKey, merkle_note::MerkleNote, note::Note};
use bellman::groth16;
use bls12_381::{Bls12, Scalar};
use ff::Field;
use group::Curve;
use ironfish_zkp::proofs::Output;
use ironfish_zkp::ValueCommitment;
use jubjub::ExtendedPoint;
use rand::thread_rng;

use std::io;

/// Parameters used when constructing proof that a new note exists. The owner
/// of this note is the recipient of funds in a transaction. The note is signed
/// with the owners public key so only they can read it.
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

impl OutputBuilder {
    /// Create a new [`OutputBuilder`] attempting to create a note.
    pub(crate) fn new(note: Note) -> Self {
        let value_commitment = ValueCommitment {
            value: note.value,
            randomness: jubjub::Fr::random(thread_rng()),
        };

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

    /// Get the value_commitment from this proof as an edwards Point.
    ///
    /// This integrates the value and randomness into a single point, using an
    /// appropriate generator.
    pub(crate) fn value_commitment_point(&self) -> ExtendedPoint {
        ExtendedPoint::from(self.value_commitment.commitment())
    }

    /// Construct and return the committed [`OutputDescription`] for this receiving calculation.
    ///
    /// The [`OutputDescription`] is the publicly visible form of the new note, not
    /// including any keys or intermediate working values.
    ///
    /// Verifies the proof before returning to prevent posting broken
    /// transactions.
    pub(crate) fn build(
        &self,
        spender_key: &SaplingKey,
    ) -> Result<OutputDescription, IronfishError> {
        let diffie_hellman_keys = self.note.owner.generate_diffie_hellman_keys();

        let circuit = Output {
            value_commitment: Some(self.value_commitment.clone()),
            payment_address: Some(self.note.owner.sapling_payment_address()),
            commitment_randomness: Some(self.note.randomness),
            esk: Some(diffie_hellman_keys.0),
        };

        let proof =
            groth16::create_random_proof(circuit, &SAPLING.output_params, &mut thread_rng())?;

        let merkle_note = if self.is_miners_fee {
            MerkleNote::new_for_miners_fee(&self.note, &self.value_commitment, &diffie_hellman_keys)
        } else {
            MerkleNote::new(
                spender_key,
                &self.note,
                &self.value_commitment,
                &diffie_hellman_keys,
            )
        };

        let output_proof = OutputDescription { proof, merkle_note };

        output_proof.verify_proof()?;

        Ok(output_proof)
    }
}

/// The publicly visible values of a received note in a transaction. These
/// values are calculated by the spender using only the public address of the
/// owner of this new note.
///
/// This is the variation of an Output that gets serialized to bytes and can
/// be loaded from bytes.
#[derive(Clone)]
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

    /// Verify that the proof demonstrates knowledge that a note exists with
    /// the value_commitment, public_key, and note_commitment on this proof.
    pub fn verify_proof(&self) -> Result<(), IronfishError> {
        self.verify_value_commitment()?;

        groth16::verify_proof(
            &SAPLING.output_verifying_key,
            &self.proof,
            &self.public_inputs()[..],
        )?;

        Ok(())
    }

    pub fn verify_value_commitment(&self) -> Result<(), IronfishError> {
        if self.merkle_note.value_commitment.is_small_order().into()
            || ExtendedPoint::from(self.merkle_note.ephemeral_public_key)
                .is_small_order()
                .into()
        {
            return Err(IronfishError::IsSmallOrder);
        }

        Ok(())
    }

    /// Converts the values to appropriate inputs for verifying the bellman proof.
    /// Demonstrates knowledge of a note containing the value_commitment, public_key
    /// and note_commitment
    pub fn public_inputs(&self) -> [Scalar; 5] {
        let mut public_inputs = [Scalar::zero(); 5];
        let p = self.merkle_note.value_commitment.to_affine();
        public_inputs[0] = p.get_u();
        public_inputs[1] = p.get_v();

        let p = ExtendedPoint::from(self.merkle_note.ephemeral_public_key).to_affine();
        public_inputs[2] = p.get_u();
        public_inputs[3] = p.get_v();

        public_inputs[4] = self.merkle_note.note_commitment;

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
mod test {
    use super::{OutputBuilder, OutputDescription};
    use crate::{keys::SaplingKey, merkle_note::NOTE_ENCRYPTION_MINER_KEYS, note::Note};
    use ff::PrimeField;
    use group::Curve;
    use jubjub::ExtendedPoint;

    #[test]
    /// Test to confirm that creating an output with the `is_miners_fee` flag
    /// set will use the hard-coded note encryption keys
    fn test_output_miners_fee() {
        let spender_key = SaplingKey::generate_key();
        let note = Note::new(spender_key.generate_public_address(), 42, "");

        let mut output = OutputBuilder::new(note);
        output.set_is_miners_fee();

        let proof = output
            .build(&spender_key)
            .expect("should be able to build output proof");

        assert_eq!(
            &proof.merkle_note.note_encryption_keys,
            NOTE_ENCRYPTION_MINER_KEYS
        );
    }

    #[test]
    fn test_output_not_miners_fee() {
        let spender_key = SaplingKey::generate_key();
        let note = Note::new(spender_key.generate_public_address(), 42, "");

        let output = OutputBuilder::new(note);

        let proof = output
            .build(&spender_key)
            .expect("should be able to build output proof");

        assert_ne!(
            &proof.merkle_note.note_encryption_keys,
            NOTE_ENCRYPTION_MINER_KEYS
        );
    }

    #[test]
    fn test_output_round_trip() {
        let spender_key = SaplingKey::generate_key();
        let note = Note::new(spender_key.generate_public_address(), 42, "");

        let output = OutputBuilder::new(note);
        let proof = output
            .build(&spender_key)
            .expect("Should be able to build output proof");
        proof.verify_proof().expect("proof should check out");

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
