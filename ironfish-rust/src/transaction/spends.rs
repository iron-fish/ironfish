/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::{IronfishError, IronfishErrorKind},
    keys::SaplingKey,
    serializing::{read_point, read_scalar},
    transaction::TRANSACTION_PUBLIC_KEY_SIZE,
};
use blstrs::{Bls12, Scalar};
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use ff::{Field, PrimeField};
use group::{Curve, GroupEncoding};
use ironfish_bellperson::{gadgets::multipack, groth16};
use ironfish_jubjub::{ExtendedPoint, Fr};
use ironfish_zkp::{
    constants::SPENDING_KEY_GENERATOR,
    redjubjub::{self, Signature},
    Nullifier,
};
use rand::thread_rng;
use std::io;

#[cfg(feature = "transaction-proofs")]
use crate::transaction::verify::verify_spend_proof;
#[cfg(feature = "transaction-proofs")]
use crate::{
    merkle_note::{position as witness_position, sapling_auth_path},
    note::Note,
    sapling_bls12::SAPLING,
    witness::WitnessTrait,
    ViewKey,
};
#[cfg(feature = "transaction-proofs")]
use ironfish_zkp::{primitives::ValueCommitment, proofs::Spend, ProofGenerationKey};

/// Parameters used when constructing proof that the spender owns a note with
/// a given value.
///
/// Contains all the working values needed to construct the proof.
#[derive(Clone, Debug)]
#[cfg(feature = "transaction-proofs")]
pub struct SpendBuilder {
    pub(crate) note: Note,

    /// Randomized value commitment. Sometimes referred to as
    /// `cv` in the literature. It's calculated by multiplying a value by a
    /// random number. Randomized to help maintain zero knowledge.
    pub(crate) value_commitment: ValueCommitment,

    /// The root hash of the tree at the time the proof was calculated. Referred to as
    /// `anchor` in the literature.
    pub(crate) root_hash: Scalar,

    /// The size of the tree at the time the proof was calculated. This is not
    /// incorporated into the proof, but is supplied to help miners verify the
    /// root hash at the time of spend.
    pub(crate) tree_size: u32,
    pub(crate) witness_position: u64,
    pub(crate) auth_path: Vec<Option<(Scalar, bool)>>,
}

#[cfg(feature = "transaction-proofs")]
impl SpendBuilder {
    /// Create a new [`SpendBuilder`] attempting to spend a note at a given
    /// location in the merkle tree.
    ///
    /// This is the only time this API thinks about the merkle tree. The witness
    /// contains the root-hash at the time the witness was created and the path
    /// to verify the location of that note in the tree.
    pub fn new<W: WitnessTrait + ?Sized>(note: Note, witness: &W) -> Self {
        let value_commitment = ValueCommitment::new(note.value, note.asset_generator());

        SpendBuilder {
            note,
            value_commitment,
            root_hash: witness.root_hash(),
            tree_size: witness.tree_size(),
            witness_position: witness_position(witness),
            auth_path: sapling_auth_path(witness),
        }
    }

    /// Get the value_commitment from this proof as an edwards Point.
    ///
    /// This integrates the value and randomness into a single point, using an
    /// appropriate generator.
    pub fn value_commitment_point(&self) -> ExtendedPoint {
        ExtendedPoint::from(self.value_commitment.commitment())
    }

    pub fn build_circuit(
        &self,
        proof_generation_key: &ProofGenerationKey,
        public_key_randomness: &Fr,
    ) -> Spend {
        Spend {
            value_commitment: Some(self.value_commitment.clone()),
            proof_generation_key: Some(proof_generation_key.clone()),
            payment_address: Some(self.note.owner.0),
            auth_path: self.auth_path.clone(),
            commitment_randomness: Some(self.note.randomness),
            anchor: Some(self.root_hash),
            ar: Some(*public_key_randomness),
            sender_address: Some(self.note.sender.0),
        }
    }

    /// Sign this spend with the private key, and return a [`SpendDescription`]
    /// suitable for serialization.
    ///
    /// Verifies the proof before returning to prevent posting broken
    /// transactions
    pub fn build(
        &self,
        proof_generation_key: &ProofGenerationKey,
        view_key: &ViewKey,
        public_key_randomness: &Fr,
        randomized_public_key: &redjubjub::PublicKey,
    ) -> Result<UnsignedSpendDescription, IronfishError> {
        let value_commitment_point = self.value_commitment_point();

        let circuit = self.build_circuit(proof_generation_key, public_key_randomness);

        // Proof that the spend was valid and successful for the provided owner
        // and note.
        let proof =
            groth16::create_random_proof(circuit, &SAPLING.spend_params, &mut thread_rng())?;

        // Bytes to be placed into the nullifier set to verify whether this note
        // has been previously spent.
        let nullifier = self.note.nullifier(view_key, self.witness_position);

        let blank_signature = {
            let buf = [0u8; 64];
            Signature::read(&mut buf.as_ref())?
        };

        let description = SpendDescription {
            proof,
            value_commitment: value_commitment_point,
            root_hash: self.root_hash,
            tree_size: self.tree_size,
            nullifier,
            authorizing_signature: blank_signature,
        };
        description.partial_verify()?;

        verify_spend_proof(
            &description.proof,
            &description.public_inputs(randomized_public_key),
        )?;

        Ok(UnsignedSpendDescription {
            public_key_randomness: *public_key_randomness,
            description,
        })
    }
}

#[derive(Clone, Debug)]
pub struct UnsignedSpendDescription {
    /// Used to add randomness to signature generation without leaking the
    /// key. Referred to as `ar` in the literature.
    public_key_randomness: Fr,

    /// Proof and public parameters for a user action to spend tokens.
    pub(crate) description: SpendDescription,
}

impl UnsignedSpendDescription {
    pub fn sign(
        mut self,
        spender_key: &SaplingKey,
        signature_hash: &[u8; 32],
    ) -> Result<SpendDescription, IronfishError> {
        let private_key = redjubjub::PrivateKey(spender_key.spend_authorizing_key);
        let randomized_private_key = private_key.randomize(self.public_key_randomness);

        let randomized_public_key =
            redjubjub::PublicKey::from_private(&randomized_private_key, *SPENDING_KEY_GENERATOR);

        let transaction_randomized_public_key =
            redjubjub::PublicKey(spender_key.view_key.authorizing_key.into())
                .randomize(self.public_key_randomness, *SPENDING_KEY_GENERATOR);

        if randomized_public_key.0 != transaction_randomized_public_key.0 {
            return Err(IronfishError::new(IronfishErrorKind::InvalidSigningKey));
        }

        // NOTE: The initial versions of the RedDSA specification and the redjubjub crate (that
        // we're using here) require the public key bytes to be prefixed to the message. The latest
        // version of the spec and the crate add the public key bytes automatically. Therefore, if
        // in the future we upgrade to a newer version of redjubjub, `data_to_be_signed` will have
        // to equal `signature_hash`
        let mut data_to_be_signed = [0; 64];
        data_to_be_signed[..TRANSACTION_PUBLIC_KEY_SIZE]
            .copy_from_slice(&transaction_randomized_public_key.0.to_bytes());
        data_to_be_signed[32..].copy_from_slice(&signature_hash[..]);

        self.description.authorizing_signature = randomized_private_key.sign(
            &data_to_be_signed,
            &mut thread_rng(),
            *SPENDING_KEY_GENERATOR,
        );

        Ok(self.description)
    }

    pub fn add_signature(mut self, signature: Signature) -> SpendDescription {
        self.description.authorizing_signature = signature;
        self.description
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let public_key_randomness = read_scalar(&mut reader)?;
        let description = SpendDescription::read(&mut reader)?;

        Ok(UnsignedSpendDescription {
            public_key_randomness,
            description,
        })
    }

    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        writer.write_all(&self.public_key_randomness.to_bytes())?;
        self.description.write(&mut writer)?;

        Ok(())
    }
}

/// The publicly visible value of a spent note. These get serialized to prove
/// that the owner once had access to these values. It also publishes the
/// nullifier so that they can't pretend they still have access to them.
#[derive(Clone, Debug)]
pub struct SpendDescription {
    /// Proof that the spend was valid and successful for the provided owner
    /// and note.
    pub(crate) proof: groth16::Proof<Bls12>,

    /// Randomized value commitment. Sometimes referred to as
    /// `cv` in the literature. It's calculated by multiplying a value by a
    /// random number. Randomized to help maintain zero knowledge.
    pub(crate) value_commitment: ExtendedPoint,

    /// The root hash of the merkle tree at the time the proof was calculated.
    /// Referred to as `anchor` in the literature.
    pub(crate) root_hash: Scalar,

    /// The size of the tree at the time the proof was calculated. This is not
    /// incorporated into the proof, but helps miners verify that the root
    /// hash the client supplied is valid in the tree.
    pub(crate) tree_size: u32,

    /// Bytes to be placed into the nullifier set to verify whether this
    /// note has been previously spent.
    pub(crate) nullifier: Nullifier,

    /// Signature of the note owner authorizing the spend. This is calculated
    /// after the transaction is complete, as it depends on a binding signature
    /// key that incorporates calculations from all the spends and outputs
    /// in that transaction. It's optional because it is calculated after
    /// construction.
    pub(crate) authorizing_signature: Signature,
}

impl SpendDescription {
    /// Load a [`SpendDescription`] from a Read implementation (e.g: socket,
    /// file) This is the main entry-point when reconstructing a serialized
    /// transaction.
    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let proof = groth16::Proof::read(&mut reader)?;
        let value_commitment = read_point(&mut reader)?;
        let root_hash = read_scalar(&mut reader)?;
        let tree_size = reader.read_u32::<LittleEndian>()?;
        let mut nullifier = Nullifier([0; 32]);
        reader.read_exact(&mut nullifier.0)?;
        let authorizing_signature = Signature::read(&mut reader)?;

        Ok(SpendDescription {
            proof,
            value_commitment,
            root_hash,
            tree_size,
            nullifier,
            authorizing_signature,
        })
    }

    /// Stow the bytes of this [`SpendDescription`] in the given writer.
    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        self.serialize_signature_fields(&mut writer)?;
        self.authorizing_signature.write(&mut writer)?;

        Ok(())
    }

    pub fn nullifier(&self) -> Nullifier {
        self.nullifier
    }

    pub fn root_hash(&self) -> Scalar {
        self.root_hash
    }

    pub fn tree_size(&self) -> u32 {
        self.tree_size
    }

    /// Verify that the signature on this proof is signing the provided input
    /// with the randomized_public_key on this proof.
    pub fn verify_signature(
        &self,
        signature_hash_value: &[u8; 32],
        randomized_public_key: &redjubjub::PublicKey,
    ) -> Result<(), IronfishError> {
        if randomized_public_key.0.is_small_order().into() {
            return Err(IronfishError::new(IronfishErrorKind::IsSmallOrder));
        }

        // NOTE: The initial versions of the RedDSA specification and the redjubjub crate (that
        // we're using here) require the public key bytes to be prefixed to the message. The latest
        // version of the spec and the crate add the public key bytes automatically. Therefore, if
        // in the future we upgrade to a newer version of redjubjub, `data_to_be_signed` will have
        // to equal `signature_hash_value`
        let mut data_to_be_signed = [0; 64];
        data_to_be_signed[..32].copy_from_slice(&randomized_public_key.0.to_bytes());
        data_to_be_signed[32..].copy_from_slice(&signature_hash_value[..]);

        if !randomized_public_key.verify(
            &data_to_be_signed,
            &self.authorizing_signature,
            *SPENDING_KEY_GENERATOR,
        ) {
            return Err(IronfishError::new(IronfishErrorKind::InvalidSpendSignature));
        }

        Ok(())
    }

    /// A function to encapsulate any verification besides the proof itself.
    /// This allows us to abstract away the details and make it easier to work
    /// with. Note that this does not verify the proof, that happens in the
    /// [`SpendBuilder`] build function as the prover, and in
    /// [`super::batch_verify_transactions`] as the verifier.
    pub fn partial_verify(&self) -> Result<(), IronfishError> {
        self.verify_not_small_order()?;

        Ok(())
    }

    fn verify_not_small_order(&self) -> Result<(), IronfishError> {
        if self.value_commitment.is_small_order().into() {
            return Err(IronfishError::new(IronfishErrorKind::IsSmallOrder));
        }

        Ok(())
    }

    /// Converts the values to appropriate inputs for verifying the bellperson
    /// proof.  Confirms the randomized_public_key, commitment_value, anchor
    /// (root hash), and nullifier attached to this [`SpendDescription`].
    pub fn public_inputs(&self, randomized_public_key: &redjubjub::PublicKey) -> [Scalar; 7] {
        let mut public_inputs = [Scalar::zero(); 7];
        let p = randomized_public_key.0.to_affine();
        public_inputs[0] = p.get_u();
        public_inputs[1] = p.get_v();

        let p = self.value_commitment.to_affine();
        public_inputs[2] = p.get_u();
        public_inputs[3] = p.get_v();

        public_inputs[4] = self.root_hash;

        let nullifier = multipack::bytes_to_bits_le(&self.nullifier.0);
        let nullifier = multipack::compute_multipacking(&nullifier);
        public_inputs[5] = nullifier[0];
        public_inputs[6] = nullifier[1];

        public_inputs
    }

    /// Serialize the fields that are needed in calculating a signature to
    /// the provided writer (probably a Blake2B writer)
    pub(crate) fn serialize_signature_fields<W: io::Write>(
        &self,
        writer: W,
    ) -> Result<(), IronfishError> {
        serialize_signature_fields(
            writer,
            &self.proof,
            &self.value_commitment,
            &self.root_hash,
            self.tree_size,
            &self.nullifier,
        )
    }
}

/// Given a writer (probably a Blake2b hasher), write byte representations
/// of the parameters that are used in calculating the signature of a transaction.
fn serialize_signature_fields<W: io::Write>(
    mut writer: W,
    proof: &groth16::Proof<Bls12>,
    value_commitment: &ExtendedPoint,
    root_hash: &Scalar,
    tree_size: u32,
    nullifier: &Nullifier,
) -> Result<(), IronfishError> {
    proof.write(&mut writer)?;
    writer.write_all(&value_commitment.to_bytes())?;
    writer.write_all(root_hash.to_repr().as_ref())?;
    writer.write_u32::<LittleEndian>(tree_size)?;
    writer.write_all(&nullifier.0)?;

    Ok(())
}

#[cfg(test)]
#[cfg(feature = "transaction-proofs")]
mod test {
    use super::{SpendBuilder, SpendDescription};
    use crate::{
        assets::asset_identifier::NATIVE_ASSET, keys::SaplingKey, note::Note,
        test_util::make_fake_witness, transaction::verify::verify_spend_proof,
    };
    use ff::Field;
    use group::Curve;
    use ironfish_jubjub::Fr;
    use ironfish_zkp::{
        constants::SPENDING_KEY_GENERATOR,
        redjubjub::{PrivateKey, PublicKey},
    };
    use rand::{random, thread_rng, Rng};

    #[test]
    fn test_spend_builder() {
        let key = SaplingKey::generate_key();
        let public_address = key.public_address();
        let sender_key = SaplingKey::generate_key();

        let public_key_randomness = Fr::random(thread_rng());
        let randomized_public_key = PublicKey(key.view_key.authorizing_key.into())
            .randomize(public_key_randomness, *SPENDING_KEY_GENERATOR);

        let other_public_key_randomness = Fr::random(thread_rng());
        let other_randomized_public_key = PublicKey(sender_key.view_key.authorizing_key.into())
            .randomize(other_public_key_randomness, *SPENDING_KEY_GENERATOR);

        let note_randomness = random();

        let note = Note::new(
            public_address,
            note_randomness,
            "",
            NATIVE_ASSET,
            sender_key.public_address(),
        );
        let witness = make_fake_witness(&note);

        let spend = SpendBuilder::new(note, &witness);

        // signature comes from transaction, normally
        let mut sig_hash = [0u8; 32];
        thread_rng().fill(&mut sig_hash[..]);

        let unsigned_proof = spend
            .build(
                &key.sapling_proof_generation_key(),
                key.view_key(),
                &public_key_randomness,
                &randomized_public_key,
            )
            .expect("should be able to build proof");

        verify_spend_proof(
            &unsigned_proof.description.proof,
            &unsigned_proof
                .description
                .public_inputs(&randomized_public_key),
        )
        .expect("should be able to verify proof");

        // Wrong spender key
        assert!(spend
            .build(
                &sender_key.sapling_proof_generation_key(),
                sender_key.view_key(),
                &public_key_randomness,
                &randomized_public_key
            )
            .is_err());

        // Wrong public key randomness
        assert!(spend
            .build(
                &key.sapling_proof_generation_key(),
                key.view_key(),
                &other_public_key_randomness,
                &randomized_public_key
            )
            .is_err());

        // Wrong randomized public key
        assert!(spend
            .build(
                &key.sapling_proof_generation_key(),
                key.view_key(),
                &public_key_randomness,
                &other_randomized_public_key
            )
            .is_err());

        assert!(verify_spend_proof(
            &unsigned_proof.description.proof,
            &unsigned_proof
                .description
                .public_inputs(&other_randomized_public_key),
        )
        .is_err());
    }

    #[test]
    fn test_spend_round_trip() {
        let key = SaplingKey::generate_key();
        let public_address = key.public_address();
        let sender_key = SaplingKey::generate_key();

        let note_randomness = random();

        let note = Note::new(
            public_address,
            note_randomness,
            "",
            NATIVE_ASSET,
            sender_key.public_address(),
        );
        let witness = make_fake_witness(&note);

        let spend = SpendBuilder::new(note, &witness);

        let public_key_randomness = Fr::random(thread_rng());
        let randomized_public_key = PublicKey(key.view_key.authorizing_key.into())
            .randomize(public_key_randomness, *SPENDING_KEY_GENERATOR);

        // signature comes from transaction, normally
        let mut sig_hash = [0u8; 32];
        thread_rng().fill(&mut sig_hash[..]);

        let unsigned_proof = spend
            .build(
                &key.sapling_proof_generation_key(),
                key.view_key(),
                &public_key_randomness,
                &randomized_public_key,
            )
            .expect("should be able to build proof");
        let proof = unsigned_proof
            .sign(&key, &sig_hash)
            .expect("should be able to sign proof");
        verify_spend_proof(&proof.proof, &proof.public_inputs(&randomized_public_key))
            .expect("proof should check out");
        proof
            .verify_signature(&sig_hash, &randomized_public_key)
            .expect("should be able to verify signature");

        let mut other_hash = [0u8; 32];
        thread_rng().fill(&mut other_hash[..]);
        assert!(
            proof
                .verify_signature(&other_hash, &randomized_public_key)
                .is_err(),
            "should error if not signing correct value"
        );

        // test serialization
        let mut serialized_proof = vec![];
        proof
            .write(&mut serialized_proof)
            .expect("should be able to serialize proof");
        let read_back_proof: SpendDescription =
            SpendDescription::read(&mut serialized_proof[..].as_ref())
                .expect("should be able to deserialize valid proof");

        assert_eq!(proof.proof.a, read_back_proof.proof.a);
        assert_eq!(proof.proof.b, read_back_proof.proof.b);
        assert_eq!(proof.proof.c, read_back_proof.proof.c);
        assert_eq!(
            proof.value_commitment.to_affine(),
            read_back_proof.value_commitment.to_affine()
        );

        assert_eq!(proof.root_hash, read_back_proof.root_hash);
        assert_eq!(proof.nullifier, read_back_proof.nullifier);
        let mut serialized_again = vec![];
        read_back_proof
            .write(&mut serialized_again)
            .expect("should be able to serialize proof again");
        assert_eq!(serialized_proof, serialized_again);
    }

    #[test]
    fn test_add_signature() {
        let key = SaplingKey::generate_key();
        let public_address = key.public_address();
        let sender_key = SaplingKey::generate_key();

        let note_randomness = random();

        let note = Note::new(
            public_address,
            note_randomness,
            "",
            NATIVE_ASSET,
            sender_key.public_address(),
        );
        let witness = make_fake_witness(&note);
        let public_key_randomness = Fr::random(thread_rng());
        let randomized_public_key = PublicKey(key.view_key.authorizing_key.into())
            .randomize(public_key_randomness, *SPENDING_KEY_GENERATOR);

        let builder = SpendBuilder::new(note, &witness);
        // create a random private key and sign random message as placeholder
        let private_key = PrivateKey(Fr::random(thread_rng()));
        let public_key = PublicKey::from_private(&private_key, *SPENDING_KEY_GENERATOR);
        let msg = [0u8; 32];
        let signature = private_key.sign(&msg, &mut thread_rng(), *SPENDING_KEY_GENERATOR);
        let unsigned_spend_description = builder
            .build(
                &key.sapling_proof_generation_key(),
                key.view_key(),
                &public_key_randomness,
                &randomized_public_key,
            )
            .expect("should be able to build proof");
        unsigned_spend_description.add_signature(signature);
        assert!(public_key.verify(&msg, &signature, *SPENDING_KEY_GENERATOR))
    }
}
