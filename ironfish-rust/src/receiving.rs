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
use rand::{rngs::OsRng, thread_rng};

use std::io;

/// Parameters used when constructing proof that a new note exists. The owner
/// of this note is the recipient of funds in a transaction. The note is signed
/// with the owners public key so only they can read it.
pub struct ReceiptParams {
    /// Proof that the output circuit was valid and successful
    pub(crate) proof: groth16::Proof<Bls12>,

    /// Randomness used to create the ValueCommitment point on the Merkle Note
    pub(crate) value_commitment_randomness: jubjub::Fr,

    /// Merkle note containing all the values verified by the proof. These values
    /// are shared on the blockchain and can be snapshotted into a Merkle Tree
    pub(crate) merkle_note: MerkleNote,
}

impl ReceiptParams {
    /// Construct the parameters for proving a new specific note
    pub(crate) fn new(
        spender_key: &SaplingKey,
        note: &Note,
    ) -> Result<ReceiptParams, IronfishError> {
        let diffie_hellman_keys = note.owner.generate_diffie_hellman_keys();

        let value_commitment_randomness: jubjub::Fr = jubjub::Fr::random(thread_rng());

        let value_commitment = ValueCommitment {
            value: note.value,
            randomness: value_commitment_randomness,
        };

        let merkle_note =
            MerkleNote::new(spender_key, note, &value_commitment, &diffie_hellman_keys);

        let output_circuit = Output {
            value_commitment: Some(value_commitment),
            payment_address: Some(note.owner.sapling_payment_address()),
            commitment_randomness: Some(note.randomness),
            esk: Some(diffie_hellman_keys.0),
        };
        let proof =
            groth16::create_random_proof(output_circuit, &SAPLING.receipt_params, &mut OsRng)?;

        let receipt_proof = ReceiptParams {
            proof,
            value_commitment_randomness,
            merkle_note,
        };

        Ok(receipt_proof)
    }

    /// Output the committed ReceiptProof for this receiving calculation.
    ///
    /// The ReceiptProof is the publicly visible form of the new note, not
    /// including any keys or intermediate working values.
    ///
    /// Verifies the proof before returning to prevent posting broken
    /// transactions.
    pub fn post(&self) -> Result<ReceiptProof, IronfishError> {
        let receipt_proof = ReceiptProof {
            proof: self.proof.clone(),
            merkle_note: self.merkle_note.clone(),
        };
        receipt_proof.verify_proof()?;

        Ok(receipt_proof)
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

/// The publicly visible values of a received note in a transaction. These
/// values are calculated by the spender using only the public address of the
/// owner of this new note.
///
/// This is the variation of a Receipt that gets serialized to bytes and can
/// be loaded from bytes.
#[derive(Clone)]
pub struct ReceiptProof {
    /// Proof that the output circuit was valid and successful
    pub(crate) proof: groth16::Proof<Bls12>,

    pub(crate) merkle_note: MerkleNote,
}

impl ReceiptProof {
    /// Load a ReceiptProof from a Read implementation( e.g: socket, file)
    /// This is the main entry-point when reconstructing a serialized
    /// transaction.
    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let proof = groth16::Proof::read(&mut reader)?;
        let merkle_note = MerkleNote::read(&mut reader)?;

        Ok(ReceiptProof { proof, merkle_note })
    }

    /// Stow the bytes of this ReceiptProof in the given writer.
    pub fn write<W: io::Write>(&self, writer: W) -> Result<(), IronfishError> {
        self.serialize_signature_fields(writer)
    }

    /// Verify that the proof demonstrates knowledge that a note exists with
    /// the value_commitment, public_key, and note_commitment on this proof.
    pub fn verify_proof(&self) -> Result<(), IronfishError> {
        self.verify_value_commitment()?;

        groth16::verify_proof(
            &SAPLING.receipt_verifying_key,
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
    use super::{ReceiptParams, ReceiptProof};
    use crate::{keys::SaplingKey, note::Note};
    use ff::PrimeField;
    use group::Curve;
    use jubjub::ExtendedPoint;

    #[test]
    fn test_receipt_round_trip() {
        let spender_key: SaplingKey = SaplingKey::generate_key();
        let note = Note::new(spender_key.generate_public_address(), 42, "");

        let receipt = ReceiptParams::new(&spender_key, &note)
            .expect("should be able to create receipt proof");
        let proof = receipt
            .post()
            .expect("Should be able to post receipt proof");
        proof.verify_proof().expect("proof should check out");

        // test serialization
        let mut serialized_proof = vec![];
        proof
            .write(&mut serialized_proof)
            .expect("Should be able to serialize proof");
        let read_back_proof: ReceiptProof = ReceiptProof::read(&mut serialized_proof[..].as_ref())
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
