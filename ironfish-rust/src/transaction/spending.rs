/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::IronfishError,
    keys::SaplingKey,
    merkle_note::{position as witness_position, sapling_auth_path},
    note::Note,
    sapling_bls12::SAPLING,
    serializing::read_scalar,
    witness::WitnessTrait,
};

use bellman::gadgets::multipack;
use bellman::groth16;
use bls12_381::{Bls12, Scalar};
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use ff::{Field, PrimeField};
use group::{Curve, GroupEncoding};
use ironfish_zkp::proofs::Spend;
use ironfish_zkp::{constants::SPENDING_KEY_GENERATOR, redjubjub::Signature};
use ironfish_zkp::{redjubjub, Nullifier, ValueCommitment};
use jubjub::ExtendedPoint;
use rand::thread_rng;
use std::io;

/// Parameters used when constructing proof that the spender owns a note with
/// a given value.
///
/// Contains all the working values needed to construct the proof.
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

impl SpendBuilder {
    /// Create a new [`SpendBuilder`] attempting to spend a note at a given
    /// location in the merkle tree.
    ///
    /// This is the only time this API thinks about the merkle tree. The witness
    /// contains the root-hash at the time the witness was created and the path
    /// to verify the location of that note in the tree.
    pub(crate) fn new(note: Note, witness: &dyn WitnessTrait) -> Self {
        let value_commitment = ValueCommitment {
            value: note.value,
            randomness: jubjub::Fr::random(thread_rng()),
        };

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

    /// Sign this spend with the private key, and return a [`SpendDescription`]
    /// suitable for serialization.
    ///
    /// Verifies the proof before returning to prevent posting broken
    /// transactions
    pub(crate) fn build(
        &self,
        spender_key: &SaplingKey,
    ) -> Result<UnsignedSpendDescription, IronfishError> {
        // Used to add randomness to signature generation without leaking the
        // key. Referred to as `ar` in the literature.
        let public_key_randomness = jubjub::Fr::random(thread_rng());

        let value_commitment_point = self.value_commitment_point();

        let circuit = Spend {
            value_commitment: Some(self.value_commitment.clone()),
            proof_generation_key: Some(spender_key.sapling_proof_generation_key()),
            payment_address: Some(self.note.owner.sapling_payment_address()),
            auth_path: self.auth_path.clone(),
            commitment_randomness: Some(self.note.randomness),
            anchor: Some(self.root_hash),
            ar: Some(public_key_randomness),
        };

        // Proof that the spend was valid and successful for the provided owner
        // and note.
        let proof =
            groth16::create_random_proof(circuit, &SAPLING.spend_params, &mut thread_rng())?;

        // The public key after randomization has been applied. This is used
        // during signature verification. Referred to as `rk` in the literature
        // Calculated from the authorizing key and the public_key_randomness.
        let randomized_public_key = redjubjub::PublicKey(spender_key.authorizing_key.into())
            .randomize(public_key_randomness, SPENDING_KEY_GENERATOR);

        // Bytes to be placed into the nullifier set to verify whether this note
        // has been previously spent.
        let nullifier = self.note.nullifier(spender_key, self.witness_position);

        let blank_signature = {
            let buf = [0u8; 64];
            Signature::read(&mut buf.as_ref())?
        };

        let description = SpendDescription {
            proof,
            value_commitment: value_commitment_point,
            randomized_public_key,
            root_hash: self.root_hash,
            tree_size: self.tree_size,
            nullifier,
            authorizing_signature: blank_signature,
        };

        description.verify_proof()?;

        Ok(UnsignedSpendDescription {
            public_key_randomness,
            description,
        })
    }
}

pub struct UnsignedSpendDescription {
    /// Used to add randomness to signature generation without leaking the
    /// key. Referred to as `ar` in the literature.
    public_key_randomness: jubjub::Fr,

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
            redjubjub::PublicKey::from_private(&randomized_private_key, SPENDING_KEY_GENERATOR);

        if randomized_public_key.0 != self.description.randomized_public_key.0 {
            return Err(IronfishError::InvalidSigningKey);
        }

        let mut data_to_be_signed = [0; 64];
        data_to_be_signed[..32]
            .copy_from_slice(&self.description.randomized_public_key.0.to_bytes());
        data_to_be_signed[32..].copy_from_slice(&signature_hash[..]);

        self.description.authorizing_signature = randomized_private_key.sign(
            &data_to_be_signed,
            &mut thread_rng(),
            SPENDING_KEY_GENERATOR,
        );

        Ok(self.description)
    }
}

/// The publicly visible value of a spent note. These get serialized to prove
/// that the owner once had access to these values. It also publishes the
/// nullifier so that they can't pretend they still have access to them.
pub struct SpendDescription {
    /// Proof that the spend was valid and successful for the provided owner
    /// and note.
    pub(crate) proof: groth16::Proof<Bls12>,

    /// Randomized value commitment. Sometimes referred to as
    /// `cv` in the literature. It's calculated by multiplying a value by a
    /// random number. Randomized to help maintain zero knowledge.
    pub(crate) value_commitment: ExtendedPoint,

    /// The public key after randomization has been applied. This is used
    /// during signature verification to confirm that the owner of the note
    /// authorized the spend. Referred to as
    /// `rk` in the literature Calculated from the authorizing key and
    /// the public_key_randomness.
    pub(crate) randomized_public_key: redjubjub::PublicKey,

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
    pub(crate) authorizing_signature: redjubjub::Signature,
}

impl Clone for SpendDescription {
    fn clone(&self) -> SpendDescription {
        let randomized_public_key = redjubjub::PublicKey(self.randomized_public_key.0);
        SpendDescription {
            proof: self.proof.clone(),
            value_commitment: self.value_commitment,
            randomized_public_key,
            root_hash: self.root_hash,
            tree_size: self.tree_size,
            nullifier: self.nullifier,
            authorizing_signature: self.authorizing_signature,
        }
    }
}

impl SpendDescription {
    /// Load a [`SpendDescription`] from a Read implementation (e.g: socket,
    /// file) This is the main entry-point when reconstructing a serialized
    /// transaction.
    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let proof = groth16::Proof::read(&mut reader)?;
        let value_commitment = {
            let mut bytes = [0; 32];
            reader.read_exact(&mut bytes)?;

            Option::from(ExtendedPoint::from_bytes(&bytes)).ok_or(IronfishError::InvalidData)?
        };
        let randomized_public_key = redjubjub::PublicKey::read(&mut reader)?;
        let root_hash = read_scalar(&mut reader)?;
        let tree_size = reader.read_u32::<LittleEndian>()?;
        let mut nullifier = Nullifier([0; 32]);
        reader.read_exact(&mut nullifier.0)?;
        let authorizing_signature = redjubjub::Signature::read(&mut reader)?;

        Ok(SpendDescription {
            proof,
            value_commitment,
            randomized_public_key,
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
    pub fn verify_signature(&self, signature_hash_value: &[u8; 32]) -> Result<(), IronfishError> {
        if self.randomized_public_key.0.is_small_order().into() {
            return Err(IronfishError::IsSmallOrder);
        }
        let mut data_to_be_signed = [0; 64];
        data_to_be_signed[..32].copy_from_slice(&self.randomized_public_key.0.to_bytes());
        data_to_be_signed[32..].copy_from_slice(&signature_hash_value[..]);

        if !self.randomized_public_key.verify(
            &data_to_be_signed,
            &self.authorizing_signature,
            SPENDING_KEY_GENERATOR,
        ) {
            return Err(IronfishError::VerificationFailed);
        }

        Ok(())
    }

    /// Verify that the bellman proof confirms the randomized_public_key,
    /// commitment_value, nullifier, and anchor attached to this
    /// [`SpendDescription`].
    pub fn verify_proof(&self) -> Result<(), IronfishError> {
        self.verify_not_small_order()?;

        groth16::verify_proof(
            &SAPLING.spend_verifying_key,
            &self.proof,
            &self.public_inputs()[..],
        )?;

        Ok(())
    }

    pub fn verify_not_small_order(&self) -> Result<(), IronfishError> {
        if self.value_commitment.is_small_order().into() {
            return Err(IronfishError::IsSmallOrder);
        }

        Ok(())
    }

    /// Converts the values to appropriate inputs for verifying the bellman
    /// proof.  Confirms the randomized_public_key, commitment_value, anchor
    /// (root hash), and nullifier attached to this [`SpendDescription`].
    pub fn public_inputs(&self) -> [Scalar; 7] {
        let mut public_inputs = [Scalar::zero(); 7];
        let p = self.randomized_public_key.0.to_affine();
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
            &self.randomized_public_key,
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
    randomized_public_key: &redjubjub::PublicKey,
    root_hash: &Scalar,
    tree_size: u32,
    nullifier: &Nullifier,
) -> Result<(), IronfishError> {
    proof.write(&mut writer)?;
    writer.write_all(&value_commitment.to_bytes())?;
    writer.write_all(&randomized_public_key.0.to_bytes())?;
    writer.write_all(root_hash.to_repr().as_ref())?;
    writer.write_u32::<LittleEndian>(tree_size)?;
    writer.write_all(&nullifier.0)?;

    Ok(())
}

#[cfg(test)]
mod test {
    use super::{SpendBuilder, SpendDescription};
    use crate::{keys::SaplingKey, note::Note, test_util::make_fake_witness};
    use group::Curve;
    use rand::prelude::*;
    use rand::{thread_rng, Rng};

    #[test]
    fn test_spend_round_trip() {
        let key = SaplingKey::generate_key();
        let public_address = key.generate_public_address();

        let note_randomness = random();

        let note = Note::new(public_address, note_randomness, "");
        let witness = make_fake_witness(&note);

        let spend = SpendBuilder::new(note, &witness);

        // signature comes from transaction, normally
        let mut sig_hash = [0u8; 32];
        thread_rng().fill(&mut sig_hash[..]);

        let unsigned_proof = spend.build(&key).expect("should be able to build proof");
        let proof = unsigned_proof
            .sign(&key, &sig_hash)
            .expect("should be able to sign proof");
        proof.verify_proof().expect("proof should check out");
        proof
            .verify_signature(&sig_hash)
            .expect("should be able to verify signature");

        let mut other_hash = [0u8; 32];
        thread_rng().fill(&mut other_hash[..]);
        assert!(
            proof.verify_signature(&other_hash).is_err(),
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
        assert_eq!(
            proof.randomized_public_key.0.to_affine(),
            read_back_proof.randomized_public_key.0.to_affine()
        );
        assert_eq!(proof.root_hash, read_back_proof.root_hash);
        assert_eq!(proof.nullifier, read_back_proof.nullifier);
        let mut serialized_again = vec![];
        read_back_proof
            .write(&mut serialized_again)
            .expect("should be able to serialize proof again");
        assert_eq!(serialized_proof, serialized_again);
    }
}
