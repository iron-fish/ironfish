// Example
// let tx = TransferTransaction::build(spends, outputs);
// tx.verify();

use std::{cmp::Ordering, io, sync::Arc};

use blake2b_simd::Params as Blake2b;
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use group::GroupEncoding;
use jubjub::ExtendedPoint;
use rand::rngs::OsRng;
use zcash_primitives::{
    constants::VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
    redjubjub::{PrivateKey, PublicKey, Signature},
};

use crate::{
    errors::{SaplingProofError, TransactionError},
    note::Memo,
    receiving::OutputSignature,
    spending::SpendSignature,
    witness::WitnessTrait,
    AssetType, Note, ReceiptParams, ReceiptProof, Sapling, SaplingKey, SpendParams, SpendProof,
};

use super::{
    transaction_fee_to_point, SIGNATURE_HASH_PERSONALIZATION, TRANSACTION_SIGNATURE_VERSION,
};

// TODO: Everything
// TODO: Copy comments from transaction/mod.rs equivalent
pub trait Transaction {
    fn read(sapling: Arc<Sapling>, reader: impl io::Read) -> Result<Self, TransactionError>
    where
        Self: Sized;
    fn write(&self, writer: impl io::Write) -> io::Result<()>;
    fn verify(&self) -> Result<(), TransactionError>;
}

pub struct TransferTransaction {
    sapling: Arc<Sapling>,
    transaction_fee: i64,
    expiration_sequence: u32,

    spends: Vec<SpendProof>,
    outputs: Vec<ReceiptProof>, // TODO: Rename ReceiptParams -> OutputParams
    binding_signature: Signature,
}

impl TransferTransaction {
    pub fn build(
        sapling: Arc<Sapling>,
        transaction_fee: i64,
        expiration_sequence: u32,
        spends: Vec<Spend>,
        outputs: Vec<Output>,
    ) -> Result<TransferTransaction, TransactionError> {
        let mut binding_signature_key = jubjub::Fr::zero();
        let mut binding_verification_key = ExtendedPoint::identity();

        // Spends
        let (spend_params, total_spend_value) = add_spends(
            sapling.clone(),
            &spends,
            &mut binding_signature_key,
            &mut binding_verification_key,
        )?;

        // Outputs
        let (mut output_params, total_output_value) = add_outputs(
            sapling.clone(),
            &outputs,
            &mut binding_signature_key,
            &mut binding_verification_key,
        )?;

        let change_amount = total_spend_value - total_output_value - transaction_fee;

        match change_amount.cmp(&0) {
            Ordering::Less => {
                return Err(TransactionError::InvalidBalanceError);
            }
            Ordering::Greater => {
                // Create change note
                // TODO: AsRef or something?
                let spender_key = spends[0].spender_key.clone();
                let payout_address = spender_key.generate_public_address();
                let change_note = Note::new(
                    payout_address,
                    change_amount as u64,
                    Memo::default(),
                    AssetType::default(),
                );
                // TODO: we should verify this output value change_amount - this = 0
                let (mut change_output_params, _total_output_value) = add_outputs(
                    sapling.clone(),
                    &[Output {
                        spender_key,
                        note: &change_note,
                    }],
                    &mut binding_signature_key,
                    &mut binding_verification_key,
                )?;
                output_params.append(&mut change_output_params);
            }
            _ => {}
        }

        let private_key = PrivateKey(binding_signature_key);
        let public_key =
            PublicKey::from_private(&private_key, VALUE_COMMITMENT_RANDOMNESS_GENERATOR);

        // Check value consistency
        let value_balance_point = transaction_fee_to_point(transaction_fee)?;

        let mut calculated_public_key = binding_verification_key;
        calculated_public_key -= value_balance_point;

        if calculated_public_key != public_key.0 {
            return Err(TransactionError::InvalidBalanceError);
        }

        // Create binding signature
        let transaction_signature_hash = transaction_signature_hash(
            expiration_sequence,
            transaction_fee,
            &spend_params,
            &output_params,
        );

        let mut data_to_be_signed = [0u8; 64];
        data_to_be_signed[0..32].copy_from_slice(&public_key.0.to_bytes());
        data_to_be_signed[32..].copy_from_slice(&transaction_signature_hash);

        let binding_signature = private_key.sign(
            &data_to_be_signed,
            &mut OsRng,
            VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
        );

        // Finalize proofs
        let mut spend_proofs = Vec::with_capacity(spend_params.len());
        for spend in spend_params {
            spend_proofs.push(spend.post(&transaction_signature_hash)?);
        }

        let mut output_proofs = Vec::with_capacity(output_params.len());
        for output in output_params {
            output_proofs.push(output.post()?);
        }

        Ok(TransferTransaction {
            sapling,
            transaction_fee,
            expiration_sequence,
            spends: spend_proofs,
            outputs: output_proofs,
            binding_signature,
        })
    }
}

impl Transaction for TransferTransaction {
    fn read(sapling: Arc<Sapling>, mut reader: impl io::Read) -> Result<Self, TransactionError> {
        let num_spends = reader.read_u64::<LittleEndian>()?;
        let num_outputs = reader.read_u64::<LittleEndian>()?;
        let transaction_fee = reader.read_i64::<LittleEndian>()?;
        let expiration_sequence = reader.read_u32::<LittleEndian>()?;
        let mut spends = Vec::with_capacity(num_spends as usize);
        let mut outputs = Vec::with_capacity(num_outputs as usize);
        for _ in 0..num_spends {
            spends.push(SpendProof::read(&mut reader)?);
        }
        for _ in 0..num_outputs {
            outputs.push(ReceiptProof::read(&mut reader)?);
        }
        let binding_signature = Signature::read(&mut reader)?;

        Ok(TransferTransaction {
            sapling,
            transaction_fee,
            expiration_sequence,
            spends,
            outputs,
            binding_signature,
        })
    }

    fn write(&self, mut writer: impl io::Write) -> io::Result<()> {
        writer.write_u64::<LittleEndian>(self.spends.len() as u64)?;
        writer.write_u64::<LittleEndian>(self.outputs.len() as u64)?;
        writer.write_i64::<LittleEndian>(self.transaction_fee)?;
        writer.write_u32::<LittleEndian>(self.expiration_sequence)?;
        for spend in self.spends.iter() {
            spend.write(&mut writer)?;
        }
        for receipt in self.outputs.iter() {
            receipt.write(&mut writer)?;
        }
        self.binding_signature.write(&mut writer)?;

        Ok(())
    }

    fn verify(&self) -> Result<(), TransactionError> {
        // Context to accumulate a signature of all the spends and outputs and
        // guarantee they are part of this transaction, unmodified.
        let mut binding_verification_key = ExtendedPoint::identity();

        for spend in self.spends.iter() {
            spend.verify_proof(&self.sapling)?;
            binding_verification_key += spend.value_commitment;
        }

        for output in self.outputs.iter() {
            output.verify_proof(&self.sapling)?;
            binding_verification_key -= output.merkle_note.value_commitment;
        }

        let transaction_signature_hash = transaction_signature_hash(
            self.expiration_sequence,
            self.transaction_fee,
            &self.spends,
            &self.outputs,
        );

        for spend in self.spends.iter() {
            spend.verify_signature(&transaction_signature_hash)?;
        }

        verify_binding_signature(
            self.transaction_fee,
            &transaction_signature_hash,
            &self.binding_signature,
            &binding_verification_key,
        )?;

        Ok(())
    }
}

fn add_spends(
    sapling: Arc<Sapling>,
    spends: &[Spend],
    bsk: &mut jubjub::Fr,
    bvk: &mut ExtendedPoint,
) -> Result<(Vec<SpendParams>, i64), SaplingProofError> {
    let mut spend_params = Vec::with_capacity(spends.len());
    let mut total_value = 0;

    for spend in spends {
        let params = SpendParams::new(
            sapling.clone(),
            spend.spender_key.clone(),
            spend.note,
            spend.witness,
        )?;

        *bsk += params.value_commitment.randomness;
        // (*bsk).add_assign(params.value_commitment.randomness);
        *bvk += params.value_commitment();
        total_value += spend.note.value() as i64;

        spend_params.push(params);
    }

    Ok((spend_params, total_value))
}

fn add_outputs(
    sapling: Arc<Sapling>,
    outputs: &[Output],
    bsk: &mut jubjub::Fr,
    bvk: &mut ExtendedPoint,
) -> Result<(Vec<ReceiptParams>, i64), SaplingProofError> {
    let mut output_params = Vec::with_capacity(outputs.len());
    let mut total_value = 0;

    for output in outputs {
        // TODO: ReceiptParams and SpendParams need API alignment
        let params = ReceiptParams::new(sapling.clone(), &output.spender_key, output.note)?;

        *bsk -= params.value_commitment_randomness;
        *bvk -= params.merkle_note.value_commitment;
        total_value += output.note.value() as i64;

        output_params.push(params);
    }

    Ok((output_params, total_value))
}

fn transaction_signature_hash(
    expiration_sequence: u32,
    transaction_fee: i64,
    spends: &[impl SpendSignature],
    outputs: &[impl OutputSignature],
) -> [u8; 32] {
    let mut hasher = Blake2b::new()
        .hash_length(32)
        .personal(SIGNATURE_HASH_PERSONALIZATION)
        .to_state();

    hasher.update(TRANSACTION_SIGNATURE_VERSION);
    hasher
        .write_u32::<LittleEndian>(expiration_sequence)
        .unwrap();
    hasher.write_i64::<LittleEndian>(transaction_fee).unwrap();
    for spend in spends.iter() {
        spend.serialize_signature_fields(&mut hasher).unwrap();
    }
    for output in outputs.iter() {
        output.serialize_signature_fields(&mut hasher).unwrap();
    }

    let mut transaction_signature_hash = [0; 32];
    transaction_signature_hash.copy_from_slice(hasher.finalize().as_ref());

    transaction_signature_hash
}

// TODO: This can be generalized further, this code exists almost verbatim in ::build
pub fn verify_binding_signature(
    transaction_fee: i64,
    transaction_signature_hash: &[u8; 32],
    binding_signature: &Signature,
    binding_verification_key: &ExtendedPoint,
) -> Result<(), TransactionError> {
    let mut value_balance_point = transaction_fee_to_point(transaction_fee)?;
    value_balance_point = -value_balance_point;

    let mut public_key_point = *binding_verification_key;
    public_key_point += value_balance_point;
    let public_key = PublicKey(public_key_point);

    let mut data_to_verify_signature = [0; 64];
    data_to_verify_signature[..32].copy_from_slice(&public_key.0.to_bytes());
    (&mut data_to_verify_signature[32..]).copy_from_slice(transaction_signature_hash);

    if !public_key.verify(
        &data_to_verify_signature,
        binding_signature,
        VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
    ) {
        Err(TransactionError::VerificationFailed)
    } else {
        Ok(())
    }
}

pub struct Spend<'a> {
    spender_key: SaplingKey,
    note: &'a Note,
    witness: &'a dyn WitnessTrait,
}

impl<'a> Spend<'a> {
    pub fn new(
        spender_key: SaplingKey,
        note: &'a Note,
        witness: &'a dyn WitnessTrait,
    ) -> Spend<'a> {
        Spend {
            spender_key,
            note,
            witness,
        }
    }
}

pub struct Output<'a> {
    spender_key: SaplingKey,
    note: &'a Note,
}

impl<'a> Output<'a> {
    pub fn new(spender_key: SaplingKey, note: &'a Note) -> Output<'a> {
        Output { spender_key, note }
    }
}

#[cfg(test)]
mod tests {
    use zcash_primitives::redjubjub::Signature;

    use crate::{
        note::Memo,
        sapling_bls12,
        test_util::make_fake_witness,
        transaction::transfer::{Output, Spend, Transaction, TransferTransaction},
        AssetType, Note, SaplingKey,
    };

    #[test]
    fn test_transaction() {
        let sapling = sapling_bls12::SAPLING.clone();

        let spender_key: SaplingKey = SaplingKey::generate_key();
        let receiver_key: SaplingKey = SaplingKey::generate_key();

        let in_note = Note::new(
            spender_key.generate_public_address(),
            42,
            Memo::default(),
            AssetType::default(),
        );
        let out_note = Note::new(
            receiver_key.generate_public_address(),
            40,
            Memo::default(),
            AssetType::default(),
        );
        let in_note2 = Note::new(
            spender_key.generate_public_address(),
            18,
            Memo::default(),
            AssetType::default(),
        );

        let witness = make_fake_witness(&in_note);
        let _witness2 = make_fake_witness(&in_note2);

        let spends = vec![Spend::new(spender_key.clone(), &in_note, &witness)];

        let outputs = vec![Output::new(spender_key, &out_note)];

        let transaction = TransferTransaction::build(sapling.clone(), 1, 0, spends, outputs)
            .expect("should build");

        assert_eq!(transaction.spends.len(), 1);
        // output note and change note
        assert_eq!(transaction.outputs.len(), 2);
        assert_eq!(transaction.transaction_fee, 1);

        transaction
            .verify()
            .expect("should be able to verify transaction");

        // test serialization
        let mut serialized_transaction = vec![];
        transaction
            .write(&mut serialized_transaction)
            .expect("should be able to serialize transaction");

        let read_back_transaction: TransferTransaction =
            TransferTransaction::read(sapling, &mut serialized_transaction.as_slice())
                .expect("should be able to deserialize");

        assert_eq!(
            transaction.transaction_fee,
            read_back_transaction.transaction_fee
        );
        assert_eq!(transaction.spends.len(), read_back_transaction.spends.len());
        assert_eq!(
            transaction.outputs.len(),
            read_back_transaction.outputs.len()
        );

        // let mut serialized_again
    }

    #[test]
    // TODO: Go through and delete the old test above this when we've finished the transition (in this PR)
    fn test_transaction_signature_new() {
        let sapling = sapling_bls12::SAPLING.clone();
        let spender_key = SaplingKey::generate_key();
        let receiver_key = SaplingKey::generate_key();
        let spender_address = spender_key.generate_public_address();
        let receiver_address = receiver_key.generate_public_address();

        let in_note = Note::new(spender_address, 42, Memo::default(), AssetType::default());
        let out_note = Note::new(receiver_address, 41, Memo::default(), AssetType::default());
        let witness = make_fake_witness(&in_note);

        let spends = vec![Spend::new(spender_key.clone(), &in_note, &witness)];
        let outputs = vec![Output::new(spender_key, &out_note)];

        let transaction = TransferTransaction::build(sapling, 0, 1337, spends, outputs).unwrap();

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
