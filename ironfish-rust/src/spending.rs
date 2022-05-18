/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    primitives::{asset_type::AssetType, sapling::ValueCommitment},
    proofs::circuit::sapling::Spend,
};

use super::{
    errors,
    keys::SaplingKey,
    merkle_note::{position as witness_position, sapling_auth_path},
    merkle_note_hash::MerkleNoteHash,
    note::Note,
    serializing::read_scalar,
    witness::WitnessTrait,
    Sapling,
};
use bellman::gadgets::multipack;
use bellman::groth16;
use bls12_381::{Bls12, Scalar};
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use group::{Curve, GroupEncoding};
use jubjub::ExtendedPoint;
use rand::{rngs::OsRng, thread_rng, Rng};

use ff::PrimeField;
use std::{io, sync::Arc};
use zcash_primitives::constants::SPENDING_KEY_GENERATOR;
use zcash_primitives::primitives::Nullifier;
use zcash_primitives::redjubjub;

/// Parameters used when constructing proof that the spender owns a note with
/// a given value.
///
/// Contains all the working values needed to construct the proof, including
/// private key of the spender.
pub struct SpendParams {
    /// Parameters for a Jubjub BLS12 curve. This is essentially just a global
    /// value.
    pub(crate) sapling: Arc<Sapling>,

    /// Private key of the person spending the note.
    spender_key: SaplingKey,

    /// Used to add randomness to signature generation without leaking the key.
    /// Referred to as
    /// `ar` in the literature.
    pub(crate) public_key_randomness: jubjub::Fr,

    /// Proof that the spend was valid and successful for the provided owner
    /// and note.
    pub(crate) proof: groth16::Proof<Bls12>,

    /// Randomized value commitment. Sometimes referred to as
    /// `cv` in the literature. It's calculated by multiplying a value by a
    /// random number. Randomized to help maintain zero knowledge.
    pub(crate) value_commitment: ValueCommitment,

    /// The public key after randomization has been applied. This is used
    /// during signature verification. Referred to as
    /// `rk` in the literature Calculated from the authorizing key and
    /// the public_key_randomness.
    pub(crate) randomized_public_key: redjubjub::PublicKey,

    /// The root hash of the tree at the time the proof was calculated. Referred to as
    /// `anchor` in the literature.
    pub(crate) root_hash: Scalar,

    /// The size of the tree at the time the proof was calculated. This is not
    /// incorporated into the proof, but is supplied to help miners verify the
    /// root hash at the time of spend.
    pub(crate) tree_size: u32,

    /// Bytes to be placed into the nullifier set to verify whether this
    /// note has been previously spent.
    pub(crate) nullifier: Nullifier,
}

impl<'a> SpendParams {
    /// Construct a new SpendParams attempting to spend a note at a given location
    /// in the merkle tree.
    ///
    /// This is the only time this API thinks about the merkle tree. The witness
    /// contains the root-hash at the time the witness was created and the path
    /// to verify the location of that note in the tree.
    pub fn new(
        sapling: Arc<Sapling>,
        spender_key: SaplingKey,
        note: &Note,
        witness: &dyn WitnessTrait,
    ) -> Result<SpendParams, errors::SaplingProofError> {
        // This is a sanity check; it would be caught in proving the circuit anyway,
        // but this gives us more information in the event of a failure
        if !witness.verify(&MerkleNoteHash::new(note.commitment_point())) {
            return Err(errors::SaplingProofError::InconsistentWitness);
        }

        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);

        let asset_type = AssetType::default();

        let value_commitment =
            asset_type.value_commitment(note.value, jubjub::Fr::from_bytes_wide(&buffer));

        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);
        let public_key_randomness = jubjub::Fr::from_bytes_wide(&buffer);

        let proof_generation_key = spender_key.sapling_proof_generation_key();

        let spend_circuit = Spend {
            value_commitment: Some(value_commitment.clone()),
            asset_type: Some(asset_type),
            proof_generation_key: Some(proof_generation_key),
            payment_address: Some(note.owner.sapling_payment_address()),
            auth_path: sapling_auth_path(witness),
            commitment_randomness: Some(note.randomness),
            anchor: Some(witness.root_hash()),
            ar: Some(public_key_randomness),
        };
        let proof = groth16::create_random_proof(spend_circuit, &sapling.spend_params, &mut OsRng)?;

        let randomized_public_key = redjubjub::PublicKey(spender_key.authorizing_key.into())
            .randomize(public_key_randomness, SPENDING_KEY_GENERATOR);
        let nullifier = note.nullifier(&spender_key, witness_position(witness));

        Ok(SpendParams {
            sapling,
            spender_key,
            public_key_randomness,
            proof,
            value_commitment,
            randomized_public_key,
            root_hash: witness.root_hash(),
            tree_size: witness.tree_size(),
            nullifier,
        })
    }

    /// Sign this spend with the stored private key, and return a SpendProof
    /// suitable for serialization.
    ///
    /// Verifies the proof before returning to prevent posting broken
    /// transactions
    pub fn post(&self, signature_hash: &[u8; 32]) -> Result<SpendProof, errors::SaplingProofError> {
        let private_key = redjubjub::PrivateKey(self.spender_key.spend_authorizing_key);
        let randomized_private_key = private_key.randomize(self.public_key_randomness);
        let randomized_public_key =
            redjubjub::PublicKey::from_private(&randomized_private_key, SPENDING_KEY_GENERATOR);
        if randomized_public_key.0 != self.randomized_public_key.0 {
            return Err(errors::SaplingProofError::SigningError);
        }
        let mut data_to_be_signed = [0; 64];
        data_to_be_signed[..32].copy_from_slice(&randomized_public_key.0.to_bytes());
        data_to_be_signed[32..].copy_from_slice(&signature_hash[..]);

        let authorizing_signature =
            randomized_private_key.sign(&data_to_be_signed, &mut OsRng, SPENDING_KEY_GENERATOR);

        let spend_proof = SpendProof {
            proof: self.proof.clone(),
            value_commitment: self.value_commitment(),
            randomized_public_key,
            root_hash: self.root_hash,
            tree_size: self.tree_size,
            nullifier: self.nullifier,
            authorizing_signature,
        };

        spend_proof.verify_proof(&self.sapling)?;

        Ok(spend_proof)
    }

    /// Serialize the fields that are needed in calculating a signature to
    /// the provided writer (probably a Blake2B writer)
    ///
    /// This signature is used by the transaction to calculate the signature hash,
    /// which binds the spend to the transaction.
    ///
    /// It is also used during verification, which is why there is an identical
    /// function on the SpendProof struct.
    pub(crate) fn serialize_signature_fields<W: io::Write>(&self, writer: W) -> io::Result<()> {
        serialize_signature_fields(
            writer,
            &self.proof,
            &self.value_commitment(),
            &self.randomized_public_key,
            &self.root_hash,
            self.tree_size,
            &self.nullifier,
        )
    }

    /// Get the value_commitment from this proof as an edwards Point.
    ///
    /// This integrates the value and randomness into a single point, using
    /// an appropriate generator.
    pub(crate) fn value_commitment(&self) -> ExtendedPoint {
        self.value_commitment.commitment().into()
    }
}
/// The publicly visible value of a spent note. These get serialized to prove
/// that the owner once had access to these values. It also publishes the
/// nullifier so that they can't pretend they still have access to them.
pub struct SpendProof {
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

impl Clone for SpendProof {
    fn clone(&self) -> SpendProof {
        let randomized_public_key = redjubjub::PublicKey(self.randomized_public_key.0);
        SpendProof {
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

impl SpendProof {
    /// Load a SpendProof from a Read implementation (e.g: socket, file)
    /// This is the main entry-point when reconstructing a serialized
    /// transaction.
    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, errors::SaplingProofError> {
        let proof = groth16::Proof::read(&mut reader)?;
        let value_commitment = {
            let mut bytes = [0; 32];
            reader.read_exact(&mut bytes)?;
            let point = ExtendedPoint::from_bytes(&bytes);
            if point.is_none().into() {
                return Err(errors::SaplingProofError::IOError);
            }
            point.unwrap()
        };
        let randomized_public_key = redjubjub::PublicKey::read(&mut reader)?;
        let root_hash = read_scalar(&mut reader)?;
        let tree_size = reader.read_u32::<LittleEndian>()?;
        let mut nullifier = Nullifier([0; 32]);
        reader.read_exact(&mut nullifier.0)?;
        let authorizing_signature = redjubjub::Signature::read(&mut reader)?;

        Ok(SpendProof {
            proof,
            value_commitment,
            randomized_public_key,
            root_hash,
            tree_size,
            nullifier,
            authorizing_signature,
        })
    }

    /// Stow the bytes of this SpendProof in the given writer.
    pub fn write<W: io::Write>(&self, mut writer: W) -> io::Result<()> {
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
    ) -> Result<(), errors::SaplingProofError> {
        if self.randomized_public_key.0.is_small_order().into() {
            return Err(errors::SaplingProofError::VerificationFailed);
        }
        let mut data_to_be_signed = [0; 64];
        data_to_be_signed[..32].copy_from_slice(&self.randomized_public_key.0.to_bytes());
        data_to_be_signed[32..].copy_from_slice(&signature_hash_value[..]);

        if !self.randomized_public_key.verify(
            &data_to_be_signed,
            &self.authorizing_signature,
            SPENDING_KEY_GENERATOR,
        ) {
            Err(errors::SaplingProofError::VerificationFailed)
        } else {
            Ok(())
        }
    }

    /// Verify that the bellman proof confirms the randomized_public_key,
    /// commitment_value, nullifier, and anchor attached to this SpendProof.
    ///
    /// This entails converting all the values to appropriate inputs to the
    /// bellman circuit and executing it.
    pub fn verify_proof(&self, sapling: &Sapling) -> Result<(), errors::SaplingProofError> {
        if self.value_commitment.is_small_order().into() {
            return Err(errors::SaplingProofError::VerificationFailed);
        }

        let mut public_input = [Scalar::zero(); 7];
        let p = self.randomized_public_key.0.to_affine();
        public_input[0] = p.get_u();
        public_input[1] = p.get_v();

        let p = self.value_commitment.to_affine();
        public_input[2] = p.get_u();
        public_input[3] = p.get_v();

        public_input[4] = self.root_hash;

        let nullifier = multipack::bytes_to_bits_le(&self.nullifier.0);
        let nullifier = multipack::compute_multipacking(&nullifier);
        public_input[5] = nullifier[0];
        public_input[6] = nullifier[1];

        match groth16::verify_proof(&sapling.spend_verifying_key, &self.proof, &public_input[..]) {
            Ok(()) => Ok(()),
            _ => Err(errors::SaplingProofError::VerificationFailed),
        }
    }

    /// Serialize the fields that are needed in calculating a signature to
    /// the provided writer (probably a Blake2B writer)
    pub(crate) fn serialize_signature_fields<W: io::Write>(&self, writer: W) -> io::Result<()> {
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
/// This function is called from both SpendProof and SpendParams because
/// signing and verifying both need to calculate the signature after all spends
/// have been recorded.
fn serialize_signature_fields<W: io::Write>(
    mut writer: W,
    proof: &groth16::Proof<Bls12>,
    value_commitment: &ExtendedPoint,
    randomized_public_key: &redjubjub::PublicKey,
    root_hash: &Scalar,
    tree_size: u32,
    nullifier: &Nullifier,
) -> io::Result<()> {
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
    use super::{SpendParams, SpendProof};
    use crate::{
        keys::SaplingKey,
        note::{Memo, Note},
        sapling_bls12,
        test_util::make_fake_witness,
    };
    use group::Curve;
    use rand::prelude::*;
    use rand::{thread_rng, Rng};

    #[test]
    fn test_spend_round_trip() {
        let sapling = sapling_bls12::SAPLING.clone();

        let key = SaplingKey::generate_key();
        let public_address = key.generate_public_address();

        let note_randomness = random();

        let note = Note::new(public_address, note_randomness, Memo([0; 32]));
        let witness = make_fake_witness(&note);

        let spend = SpendParams::new(sapling.clone(), key, &note, &witness)
            .expect("should be able to create spend proof");

        // signature comes from transaction, normally
        let mut sig_hash = [0u8; 32];
        thread_rng().fill(&mut sig_hash[..]);

        let proof = spend.post(&sig_hash).expect("should be able to sign proof");
        proof
            .verify_proof(&sapling)
            .expect("proof should check out");
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
        let read_back_proof: SpendProof = SpendProof::read(&mut serialized_proof[..].as_ref())
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
