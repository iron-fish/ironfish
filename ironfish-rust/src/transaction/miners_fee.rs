use std::io;

use blake2b_simd::Params as Blake2b;
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use group::GroupEncoding;
use jubjub::ExtendedPoint;
use rand::rngs::OsRng;
use zcash_primitives::{
    constants::VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
    sapling::redjubjub::{PrivateKey, PublicKey, Signature},
};

use crate::{
    errors::TransactionError, merkle_note::NOTE_ENCRYPTION_MINER_KEYS, receiving::OutputSignature,
    Note, ReceiptParams, ReceiptProof, SaplingKey,
};

use super::{
    transaction_fee_to_point,
    transfer::{verify_binding_signature, Transaction},
    SIGNATURE_HASH_PERSONALIZATION, TRANSACTION_SIGNATURE_VERSION,
};

pub struct MinersFeeTransaction {
    fee: i64,
    output: ReceiptProof,
    binding_signature: Signature,
}

impl MinersFeeTransaction {
    /// Special case for posting a miners fee transaction. Miner fee transactions
    /// are unique in that they generate currency. They do not have any spends
    /// or change and therefore have a negative transaction fee. In normal use,
    /// a miner would not accept such a transaction unless it was explicitly set
    /// as the miners fee.
    pub fn build(
        receiver_key: SaplingKey,
        note: Note,
    ) -> Result<MinersFeeTransaction, TransactionError> {
        let fee = -(note.value as i64);
        let mut receipt_params = ReceiptParams::new(&receiver_key, &note)?;
        // Ensure the merkle note has an identifiable encryption key
        receipt_params.merkle_note.note_encryption_keys = *NOTE_ENCRYPTION_MINER_KEYS;

        let mut binding_signature_key = jubjub::Fr::zero();
        let mut binding_verification_key = ExtendedPoint::identity();
        binding_signature_key -= receipt_params.value_commitment_randomness;
        binding_verification_key -= receipt_params.merkle_note.value_commitment;

        let private_key = PrivateKey(binding_signature_key);
        let public_key =
            PublicKey::from_private(&private_key, VALUE_COMMITMENT_RANDOMNESS_GENERATOR);

        // Check value consistency
        let value_balance_point = transaction_fee_to_point(fee)?;

        let mut calculated_public_key = binding_verification_key;
        calculated_public_key -= value_balance_point;

        if calculated_public_key != public_key.0 {
            return Err(TransactionError::InvalidBalanceError);
        }

        // Create binding signature
        let transaction_signature_hash = transaction_signature_hash(&receipt_params, fee);

        let mut data_to_be_signed = [0u8; 64];
        data_to_be_signed[0..32].copy_from_slice(&public_key.0.to_bytes());
        data_to_be_signed[32..].copy_from_slice(&transaction_signature_hash);

        let binding_signature = private_key.sign(
            &data_to_be_signed,
            &mut OsRng,
            VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
        );

        Ok(MinersFeeTransaction {
            fee,
            output: receipt_params.post()?,
            binding_signature,
        })
    }
}

impl Transaction for MinersFeeTransaction {
    fn read(mut reader: impl io::Read) -> Result<Self, TransactionError> {
        let fee = reader.read_i64::<LittleEndian>()?;
        let output = ReceiptProof::read(&mut reader)?;
        let binding_signature = Signature::read(&mut reader)?;

        Ok(MinersFeeTransaction {
            fee,
            output,
            binding_signature,
        })
    }

    fn write(&self, mut writer: impl io::Write) -> io::Result<()> {
        writer.write_i64::<LittleEndian>(self.fee)?;
        self.output.write(&mut writer)?;
        self.binding_signature.write(&mut writer)?;
        Ok(())
    }

    fn verify(&self) -> Result<(), TransactionError> {
        // Context to accumulate a signature of all the spends and outputs and
        // guarantee they are part of this transaction, unmodified.
        let mut binding_verification_key = ExtendedPoint::identity();

        self.output.verify_proof()?;
        binding_verification_key -= self.output.merkle_note.value_commitment;

        let transaction_signature_hash = transaction_signature_hash(&self.output, self.fee);

        verify_binding_signature(
            self.fee,
            &transaction_signature_hash,
            &self.binding_signature,
            &binding_verification_key,
        )?;

        Ok(())
    }
}

fn transaction_signature_hash(output: &impl OutputSignature, fee: i64) -> [u8; 32] {
    let expiration_sequence = 0;
    let mut hasher = Blake2b::new()
        .hash_length(32)
        .personal(SIGNATURE_HASH_PERSONALIZATION)
        .to_state();

    hasher.update(TRANSACTION_SIGNATURE_VERSION);
    hasher
        .write_u32::<LittleEndian>(expiration_sequence)
        .unwrap();
    hasher.write_i64::<LittleEndian>(fee).unwrap();
    output.serialize_signature_fields(&mut hasher).unwrap();

    let mut transaction_signature_hash = [0; 32];
    transaction_signature_hash.copy_from_slice(hasher.finalize().as_ref());

    transaction_signature_hash
}

#[cfg(test)]
mod tests {
    use zcash_primitives::sapling::redjubjub::Signature;

    use crate::{
        merkle_note::NOTE_ENCRYPTION_MINER_KEYS, notes::note::Memo,
        transaction::miners_fee::MinersFeeTransaction, AssetType, Note, SaplingKey,
    };

    #[test]
    fn test_miners_fee() {
        let receiver_key: SaplingKey = SaplingKey::generate_key();
        let out_note = Note::new(
            receiver_key.generate_public_address(),
            42,
            Memo::default(),
            AssetType::default(),
        );

        let transaction =
            MinersFeeTransaction::build(receiver_key, out_note).expect("should build");
        assert_eq!(transaction.fee, -42);
        assert_eq!(
            transaction.output.merkle_note.note_encryption_keys[0..30],
            NOTE_ENCRYPTION_MINER_KEYS[0..30]
        );
    }

    #[test]
    // TODO: Go through and delete the old test above this when we've finished the transition (in this PR)
    fn test_transaction_signature_new() {
        let receiver_key: SaplingKey = SaplingKey::generate_key();
        let out_note = Note::new(
            receiver_key.generate_public_address(),
            42,
            Memo::default(),
            AssetType::default(),
        );

        let transaction = MinersFeeTransaction::build(receiver_key, out_note).unwrap();

        let mut serialized_signature = vec![];
        transaction
            .binding_signature
            .write(&mut serialized_signature)
            .unwrap();
        assert_eq!(serialized_signature.len(), 64);
        Signature::read(&mut serialized_signature[..].as_ref())
            .expect("Can deserialize back into a valid Signature");
    }
}
