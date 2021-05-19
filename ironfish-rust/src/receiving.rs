/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use super::{
    errors, is_small_order, keys::SaplingKey, merkle_note::MerkleNote, note::Note, Sapling,
};
use bellman::groth16;
use ff::Field;
use rand::{rngs::OsRng, thread_rng, Rng};
use zcash_primitives::jubjub::{JubjubEngine, ToUniform};
use zcash_primitives::primitives::ValueCommitment;
use zcash_proofs::circuit::sapling::Output;

use std::{io, sync::Arc};

/// Parameters used when constructing proof that a new note exists. The owner
/// of this note is the recipient of funds in a transaction. The note is signed
/// with the owners public key so only they can read it.
pub struct ReceiptParams<J: JubjubEngine + pairing::MultiMillerLoop> {
    /// Parameters for a Jubjub BLS12 curve. This is essentially just a global
    /// value.
    pub(crate) sapling: Arc<Sapling<J>>,

    /// Proof that the output circuit was valid and successful
    pub(crate) proof: groth16::Proof<J>,

    /// Randomness used to create the ValueCommitment point on the Merkle Note
    pub(crate) value_commitment_randomness: J::Fs,

    /// Merkle note containing all the values verified by the proof. These values
    /// are shared on the blockchain and can be snapshotted into a Merkle Tree
    pub(crate) merkle_note: MerkleNote<J>,
}

impl<J: JubjubEngine + pairing::MultiMillerLoop> ReceiptParams<J> {
    /// Construct the parameters for proving a new specific note
    pub(crate) fn new(
        sapling: Arc<Sapling<J>>,
        spender_key: &SaplingKey<J>,
        note: &Note<J>,
    ) -> Result<ReceiptParams<J>, errors::SaplingProofError> {
        let diffie_hellman_keys = note.owner.generate_diffie_hellman_keys(&sapling.jubjub);

        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);

        let value_commitment_randomness: J::Fs = J::Fs::to_uniform(&buffer[..]);

        let value_commitment = ValueCommitment::<J> {
            value: note.value,
            randomness: value_commitment_randomness,
        };

        let merkle_note =
            MerkleNote::new(spender_key, note, &value_commitment, &diffie_hellman_keys);

        let output_circuit = Output {
            params: &sapling.jubjub,
            value_commitment: Some(value_commitment),
            payment_address: Some(note.owner.sapling_payment_address()),
            commitment_randomness: Some(note.randomness),
            esk: Some(diffie_hellman_keys.0),
        };
        let proof =
            groth16::create_random_proof(output_circuit, &sapling.receipt_params, &mut OsRng)?;

        let receipt_proof = ReceiptParams {
            sapling,
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
    pub fn post(&self) -> Result<ReceiptProof<J>, errors::SaplingProofError> {
        let receipt_proof = ReceiptProof {
            proof: self.proof.clone(),
            merkle_note: self.merkle_note.clone(),
        };
        receipt_proof.verify_proof(&self.sapling)?;

        Ok(receipt_proof)
    }

    /// Write the signature of this proof to the provided writer.
    ///
    /// The signature is used by the transaction to calculate the signature
    /// hash. Having this data essentially binds the note to the transaction,
    /// proving that it is actually part of that transaction.
    pub(crate) fn serialize_signature_fields<W: io::Write>(&self, mut writer: W) -> io::Result<()> {
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
pub struct ReceiptProof<J: JubjubEngine + pairing::MultiMillerLoop> {
    /// Proof that the output circuit was valid and successful
    pub(crate) proof: groth16::Proof<J>,

    pub(crate) merkle_note: MerkleNote<J>,
}

impl<J: JubjubEngine + pairing::MultiMillerLoop> ReceiptProof<J> {
    /// Load a ReceiptProof<J> from a Read implementation( e.g: socket, file)
    /// This is the main entry-point when reconstructing a serialized
    /// transaction.
    pub fn read<R: io::Read>(
        sapling: Arc<Sapling<J>>,
        mut reader: R,
    ) -> Result<Self, errors::SaplingProofError> {
        let proof = groth16::Proof::read(&mut reader)?;
        let merkle_note = MerkleNote::read(&mut reader, sapling)?;

        Ok(ReceiptProof { proof, merkle_note })
    }

    /// Stow the bytes of this ReceiptProof in the given writer.
    pub fn write<W: io::Write>(&self, writer: W) -> io::Result<()> {
        self.serialize_signature_fields(writer)
    }

    /// Verify that the proof demonstrates knowledge that a note exists with
    /// the value_commitment, public_key, and note_commitment on this proof.
    pub fn verify_proof(&self, sapling: &Sapling<J>) -> Result<(), errors::SaplingProofError> {
        if is_small_order(&sapling.jubjub, &self.merkle_note.value_commitment)
            || is_small_order(&sapling.jubjub, &self.merkle_note.ephemeral_public_key)
        {
            return Err(errors::SaplingProofError::VerificationFailed);
        }
        let mut public_input = [J::Fr::zero(); 5];
        let (x, y) = self.merkle_note.value_commitment.to_xy();
        public_input[0] = x;
        public_input[1] = y;

        let (x, y) = self.merkle_note.ephemeral_public_key.to_xy();
        public_input[2] = x;
        public_input[3] = y;

        public_input[4] = self.merkle_note.note_commitment;

        match groth16::verify_proof(
            &sapling.receipt_verifying_key,
            &self.proof,
            &public_input[..],
        ) {
            Ok(true) => Ok(()),
            _ => Err(errors::SaplingProofError::VerificationFailed),
        }
    }
    /// Get a MerkleNote, which can be used as a node in a Merkle Tree.
    pub fn merkle_note(&self) -> MerkleNote<J> {
        self.merkle_note.clone()
    }

    /// Write the signature of this proof to the provided writer.
    ///
    /// The signature is used by the transaction to calculate the signature
    /// hash. Having this data essentially binds the note to the transaction,
    /// proving that it is actually part of that transaction.
    pub(crate) fn serialize_signature_fields<W: io::Write>(&self, mut writer: W) -> io::Result<()> {
        self.proof.write(&mut writer)?;
        self.merkle_note.write(&mut writer)?;
        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::{ReceiptParams, ReceiptProof};
    use crate::{
        keys::SaplingKey,
        note::{Memo, Note},
        sapling_bls12,
    };
    use ff::PrimeField;
    use pairing::bls12_381::Bls12;

    #[test]
    fn test_receipt_round_trip() {
        let sapling = &*sapling_bls12::SAPLING;
        let spender_key: SaplingKey<Bls12> = SaplingKey::generate_key(sapling.clone());
        let note = Note::new(
            sapling.clone(),
            spender_key.generate_public_address(),
            42,
            Memo([0; 32]),
        );

        let receipt = ReceiptParams::new(sapling.clone(), &spender_key, &note)
            .expect("should be able to create receipt proof");
        let proof = receipt
            .post()
            .expect("Should be able to post receipt proof");
        proof
            .verify_proof(&sapling)
            .expect("proof should check out");

        // test serialization
        let mut serialized_proof = vec![];
        proof
            .write(&mut serialized_proof)
            .expect("Should be able to serialize proof");
        let read_back_proof: ReceiptProof<Bls12> =
            ReceiptProof::read(sapling.clone(), &mut serialized_proof[..].as_ref())
                .expect("Should be able to deserialize valid proof");

        assert_eq!(proof.proof.a, read_back_proof.proof.a);
        assert_eq!(proof.proof.b, read_back_proof.proof.b);
        assert_eq!(proof.proof.c, read_back_proof.proof.c);
        assert_eq!(
            proof.merkle_note.value_commitment.to_xy(),
            read_back_proof.merkle_note.value_commitment.to_xy()
        );
        assert_eq!(
            proof.merkle_note.note_commitment.to_repr(),
            read_back_proof.merkle_note.note_commitment.to_repr()
        );
        assert_eq!(
            proof.merkle_note.ephemeral_public_key.to_xy(),
            read_back_proof.merkle_note.ephemeral_public_key.to_xy()
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
