/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::IronfishError,
    outputs::OutputBuilder,
    sapling_bls12::SAPLING,
    spending::{SpendBuilder, UnsignedSpendDescription},
};

use super::{
    keys::{PublicAddress, SaplingKey},
    note::Note,
    outputs::OutputDescription,
    spending::SpendDescription,
    witness::WitnessTrait,
};
use bellman::groth16::batch::Verifier;
use blake2b_simd::Params as Blake2b;
use bls12_381::Bls12;
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use group::GroupEncoding;
use jubjub::ExtendedPoint;
use rand::rngs::OsRng;

use ironfish_zkp::{
    constants::{VALUE_COMMITMENT_RANDOMNESS_GENERATOR, VALUE_COMMITMENT_VALUE_GENERATOR},
    redjubjub::{PrivateKey, PublicKey, Signature},
};

use std::{io, iter, slice::Iter};

#[cfg(test)]
mod tests;

const SIGNATURE_HASH_PERSONALIZATION: &[u8; 8] = b"Bnsighsh";
const TRANSACTION_SIGNATURE_VERSION: &[u8; 1] = &[0];

/// A collection of spend and output proofs that can be signed and verified.
/// In general, all the spent values should add up to all the output values.
///
/// The Transaction is used while the spends and outputs are being constructed,
/// and contains working state that is used to create the transaction information.
///
/// The Transaction, below, contains the serializable version, without any
/// secret keys or state not needed for verifying.
pub struct ProposedTransaction {
    /// Builders for the proofs of the individual spends with all values required to calculate
    /// the signatures.
    spends: Vec<SpendBuilder>,

    /// Builders for proofs of the individual outputs with values required to calculate
    /// signatures. Note: This is commonly referred to as
    /// `outputs` in the literature.
    outputs: Vec<OutputBuilder>,

    /// The balance of all the spends minus all the outputs. The difference
    /// is the fee paid to the miner for mining the transaction.
    value_balance: i64,

    /// This is the sequence in the chain the transaction will expire at and be
    /// removed from the mempool. A value of 0 indicates the transaction will
    /// not expire.
    expiration_sequence: u32,

    /// The key used to sign the transaction and any descriptions that need
    /// signed.
    spender_key: SaplingKey,
    //
    // NOTE: If adding fields here, you may need to add fields to
    // signature hash method, and also to Transaction.
}

impl ProposedTransaction {
    pub fn new(spender_key: SaplingKey) -> ProposedTransaction {
        ProposedTransaction {
            spends: vec![],
            outputs: vec![],
            value_balance: 0,
            expiration_sequence: 0,
            spender_key,
        }
    }

    /// Spend the note owned by spender_key at the given witness location.
    pub fn add_spend(&mut self, note: Note, witness: &dyn WitnessTrait) {
        self.value_balance += note.value() as i64;

        self.spends.push(SpendBuilder::new(note, witness));
    }

    /// Create a proof of a new note owned by the recipient in this
    /// transaction.
    pub fn add_output(&mut self, note: Note) {
        self.value_balance -= note.value as i64;

        self.outputs.push(OutputBuilder::new(note));
    }

    /// Post the transaction. This performs a bit of validation, and signs
    /// the spends with a signature that proves the spends are part of this
    /// transaction.
    ///
    /// Transaction fee is the amount the spender wants to send to the miner
    /// for mining this transaction. This has to be non-negative; sane miners
    /// wouldn't accept a transaction that takes money away from them.
    ///
    /// sum(spends) - sum(outputs) - intended_transaction_fee - change = 0
    /// aka: self.value_balance - intended_transaction_fee - change = 0
    pub fn post(
        &mut self,
        change_goes_to: Option<PublicAddress>,
        intended_transaction_fee: u64,
    ) -> Result<Transaction, IronfishError> {
        let change_amount = self.value_balance - intended_transaction_fee as i64;

        if change_amount < 0 {
            return Err(IronfishError::InvalidBalance);
        }
        if change_amount > 0 {
            // TODO: The public address generated from the spender_key if
            // change_goes_to is None should probably be associated with a
            // known diversifier (eg: that used on other notes?)
            // But we haven't worked out why determinacy in public addresses
            // would be useful yet.
            let change_address =
                change_goes_to.unwrap_or_else(|| self.spender_key.generate_public_address());
            let change_note = Note::new(
                change_address,
                change_amount as u64, // we checked it was positive
                "",
            );
            self.add_output(change_note);
        }
        self._partial_post()
    }

    /// Special case for posting a miners fee transaction. Miner fee transactions
    /// are unique in that they generate currency. They do not have any spends
    /// or change and therefore have a negative transaction fee. In normal use,
    /// a miner would not accept such a transaction unless it was explicitly set
    /// as the miners fee.
    pub fn post_miners_fee(&mut self) -> Result<Transaction, IronfishError> {
        if !self.spends.is_empty() || self.outputs.len() != 1 {
            return Err(IronfishError::InvalidMinersFeeTransaction);
        }
        // Ensure the merkle note has an identifiable encryption key
        self.outputs
            .get_mut(0)
            .ok_or(IronfishError::InvalidMinersFeeTransaction)?
            .set_is_miners_fee();
        self._partial_post()
    }

    /// Super special case for generating an illegal transaction for the genesis block.
    /// Don't bother using this anywhere else, it won't pass verification.
    #[deprecated(note = "Use only in genesis block generation")]
    pub fn post_genesis_transaction(&self) -> Result<Transaction, IronfishError> {
        self._partial_post()
    }

    /// Get the expiration sequence for this transaction
    pub fn expiration_sequence(&self) -> u32 {
        self.expiration_sequence
    }

    /// Set the sequence to expire the transaction from the mempool.
    pub fn set_expiration_sequence(&mut self, expiration_sequence: u32) {
        self.expiration_sequence = expiration_sequence;
    }

    // Post transaction without much validation.
    fn _partial_post(&self) -> Result<Transaction, IronfishError> {
        // Generate binding signature keys
        let bsig_keys = self.binding_signature_keys()?;

        // Build descriptions
        let mut unsigned_spends = Vec::with_capacity(self.spends.len());
        for spend in &self.spends {
            unsigned_spends.push(spend.build(&self.spender_key)?);
        }

        let mut output_descriptions = Vec::with_capacity(self.outputs.len());
        for output in &self.outputs {
            output_descriptions.push(output.build(&self.spender_key)?);
        }

        let data_to_sign = self.transaction_signature_hash(&unsigned_spends, &output_descriptions);

        let binding_signature =
            self.binding_signature(&bsig_keys.0, &bsig_keys.1, &data_to_sign)?;

        // Sign spends now that we have the data needed to be signed
        let mut spend_descriptions = Vec::with_capacity(unsigned_spends.len());
        for spend in unsigned_spends.drain(0..) {
            spend_descriptions.push(spend.sign(&self.spender_key, &data_to_sign)?);
        }

        Ok(Transaction {
            expiration_sequence: self.expiration_sequence,
            fee: self.value_balance,
            spends: spend_descriptions,
            outputs: output_descriptions,
            binding_signature,
        })
    }

    /// Calculate a hash of the transaction data. This hash is what gets signed
    /// by the private keys to verify that the transaction actually happened.
    ///
    /// This is called during final posting of the transaction
    ///
    fn transaction_signature_hash(
        &self,
        spends: &[UnsignedSpendDescription],
        outputs: &[OutputDescription],
    ) -> [u8; 32] {
        let mut hasher = Blake2b::new()
            .hash_length(32)
            .personal(SIGNATURE_HASH_PERSONALIZATION)
            .to_state();

        hasher.update(TRANSACTION_SIGNATURE_VERSION);
        hasher
            .write_u32::<LittleEndian>(self.expiration_sequence)
            .unwrap();
        hasher
            .write_i64::<LittleEndian>(self.value_balance)
            .unwrap();
        for spend in spends {
            spend
                .spend_proof
                .serialize_signature_fields(&mut hasher)
                .unwrap();
        }

        for output in outputs {
            output.serialize_signature_fields(&mut hasher).unwrap();
        }

        let mut hash_result = [0; 32];
        hash_result[..].clone_from_slice(hasher.finalize().as_ref());
        hash_result
    }

    /// The binding signature ties up all the randomness generated with the
    /// transaction and uses it as a private key to sign all the values
    /// that were calculated as part of the transaction. This function
    /// performs the calculation and sets the value on this struct.
    fn binding_signature(
        &self,
        private_key: &PrivateKey,
        public_key: &PublicKey,
        transaction_signature_hash: &[u8; 32],
    ) -> Result<Signature, IronfishError> {
        let mut data_to_be_signed = [0u8; 64];
        data_to_be_signed[..32].copy_from_slice(&public_key.0.to_bytes());
        data_to_be_signed[32..].copy_from_slice(transaction_signature_hash);

        Ok(private_key.sign(
            &data_to_be_signed,
            &mut OsRng,
            VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
        ))
    }

    fn binding_signature_keys(&self) -> Result<(PrivateKey, PublicKey), IronfishError> {
        // A "private key" manufactured from a bunch of randomness added for each
        // spend and output.
        let mut binding_signature_key = jubjub::Fr::zero();

        // A "public key" manufactured from a combination of the values of each
        // transaction and the same randomneSpendParams, s as above
        let mut binding_verification_key = ExtendedPoint::identity();

        for spend in &self.spends {
            binding_signature_key += spend.value_commitment.randomness;
            binding_verification_key += spend.value_commitment_point();
        }

        for output in &self.outputs {
            binding_signature_key -= output.value_commitment.randomness;
            binding_verification_key -= output.value_commitment_point();
        }

        let private_key = PrivateKey(binding_signature_key);
        let public_key =
            PublicKey::from_private(&private_key, VALUE_COMMITMENT_RANDOMNESS_GENERATOR);

        check_value_consistency(
            &public_key,
            &binding_verification_key,
            self.value_balance as i64,
        )?;

        Ok((private_key, public_key))
    }
}

/// A transaction that has been published and can be read by anyone, not storing
/// any of the working data or private keys used in creating the proofs.
///
/// This is the serializable form of a transaction.
#[derive(Clone)]
pub struct Transaction {
    /// The balance of total spends - outputs, which is the amount that the miner gets to keep
    fee: i64,

    /// List of spends, or input notes, that have been destroyed.
    spends: Vec<SpendDescription>,

    /// List of outputs, or output notes that have been created.
    outputs: Vec<OutputDescription>,

    /// Signature calculated from accumulating randomness with all the spends
    /// and outputs when the transaction was created.
    binding_signature: Signature,

    /// This is the sequence in the chain the transaction will expire at and be
    /// removed from the mempool. A value of 0 indicates the transaction will
    /// not expire.
    expiration_sequence: u32,
}

impl Transaction {
    /// Load a Transaction from a Read implementation (e.g: socket, file)
    /// This is the main entry-point when reconstructing a serialized transaction
    /// for verifying.
    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let num_spends = reader.read_u64::<LittleEndian>()?;
        let num_outputs = reader.read_u64::<LittleEndian>()?;
        let fee = reader.read_i64::<LittleEndian>()?;
        let expiration_sequence = reader.read_u32::<LittleEndian>()?;

        let mut spends = Vec::with_capacity(num_spends as usize);
        for _ in 0..num_spends {
            spends.push(SpendDescription::read(&mut reader)?);
        }

        let mut outputs = Vec::with_capacity(num_outputs as usize);
        for _ in 0..num_outputs {
            outputs.push(OutputDescription::read(&mut reader)?);
        }

        let binding_signature = Signature::read(&mut reader)?;

        Ok(Transaction {
            fee,
            spends,
            outputs,
            binding_signature,
            expiration_sequence,
        })
    }

    /// Store the bytes of this transaction in the given writer. This is used
    /// to serialize transactions to file or network
    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        writer.write_u64::<LittleEndian>(self.spends.len() as u64)?;
        writer.write_u64::<LittleEndian>(self.outputs.len() as u64)?;
        writer.write_i64::<LittleEndian>(self.fee)?;
        writer.write_u32::<LittleEndian>(self.expiration_sequence)?;

        for spend in self.spends.iter() {
            spend.write(&mut writer)?;
        }
        for output in self.outputs.iter() {
            output.write(&mut writer)?;
        }

        self.binding_signature.write(&mut writer)?;

        Ok(())
    }

    /// Validate the transaction. Confirms that:
    ///  *  Each of the spend proofs has the inputs it says it does
    ///  *  Each of the output proofs has the inputs it says it has
    ///  *  Each of the spend proofs was signed by the owner
    ///  *  The entire transaction was signed with a binding signature
    ///     containing those proofs (and only those proofs)
    ///
    pub fn verify(&self) -> Result<(), IronfishError> {
        batch_verify_transactions(iter::once(self))
    }

    /// Get an iterator over the spends in this transaction. Each spend
    /// is by reference
    pub fn iter_spends(&self) -> Iter<SpendDescription> {
        self.spends.iter()
    }

    pub fn spends(&self) -> &Vec<SpendDescription> {
        &self.spends
    }

    /// Get an iterator over the outputs in this transaction, by reference
    pub fn iter_outputs(&self) -> Iter<OutputDescription> {
        self.outputs.iter()
    }

    pub fn outputs(&self) -> &Vec<OutputDescription> {
        &self.outputs
    }

    /// Get the transaction fee for this transaction. Miners should generally
    /// expect this to be positive (or they would lose money mining it!).
    /// The miners_fee transaction would be a special case.
    pub fn fee(&self) -> i64 {
        self.fee
    }

    /// Get the transaction signature for this transaction.
    pub fn binding_signature(&self) -> &Signature {
        &self.binding_signature
    }

    /// Get the expiration sequence for this transaction
    pub fn expiration_sequence(&self) -> u32 {
        self.expiration_sequence
    }

    /// Calculate a hash of the transaction data. This hash was signed by the
    /// private keys when the transaction was constructed, and will now be
    /// reconstructed to verify the signature.
    pub fn transaction_signature_hash(&self) -> [u8; 32] {
        let mut hasher = Blake2b::new()
            .hash_length(32)
            .personal(SIGNATURE_HASH_PERSONALIZATION)
            .to_state();
        hasher.update(TRANSACTION_SIGNATURE_VERSION);
        hasher
            .write_u32::<LittleEndian>(self.expiration_sequence)
            .unwrap();
        hasher.write_i64::<LittleEndian>(self.fee).unwrap();
        for spend in self.spends.iter() {
            spend.serialize_signature_fields(&mut hasher).unwrap();
        }
        for output in self.outputs.iter() {
            output.serialize_signature_fields(&mut hasher).unwrap();
        }

        let mut hash_result = [0; 32];
        hash_result[..].clone_from_slice(hasher.finalize().as_ref());
        hash_result
    }

    /// Confirm that this transaction was signed by the values it contains.
    /// Called from the public verify function.
    fn verify_binding_signature(
        &self,
        binding_verification_key: &ExtendedPoint,
    ) -> Result<(), IronfishError> {
        let value_balance_point = value_balance_to_point(self.fee)?;

        let public_key_point = binding_verification_key - value_balance_point;
        let public_key = PublicKey(public_key_point);

        let mut data_to_verify_signature = [0; 64];
        data_to_verify_signature[..32].copy_from_slice(&public_key.0.to_bytes());
        data_to_verify_signature[32..].copy_from_slice(&self.transaction_signature_hash());

        if !public_key.verify(
            &data_to_verify_signature,
            &self.binding_signature,
            VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
        ) {
            return Err(IronfishError::VerificationFailed);
        }

        Ok(())
    }
}

/// Convert the integer value to a point on the Jubjub curve, accounting for
/// negative values
fn value_balance_to_point(value: i64) -> Result<ExtendedPoint, IronfishError> {
    // Can only construct edwards point on positive numbers, so need to
    // add and possibly negate later
    let is_negative = value.is_negative();
    let abs = match value.checked_abs() {
        Some(a) => a as u64,
        None => return Err(IronfishError::IllegalValue),
    };

    let mut value_balance = VALUE_COMMITMENT_VALUE_GENERATOR * jubjub::Fr::from(abs);

    if is_negative {
        value_balance = -value_balance;
    }

    Ok(value_balance.into())
}

/// Confirm that balance of input and output values is consistent with
/// those used in the proofs.
///
/// Does not confirm that the transactions add up to zero. The calculation
/// for fees and change happens elsewhere.
fn check_value_consistency(
    public_key: &PublicKey,
    binding_verification_key: &ExtendedPoint,
    value: i64,
) -> Result<(), IronfishError> {
    let value_balance_point = value_balance_to_point(value)?;

    let calculated_public_key = binding_verification_key - value_balance_point;

    if calculated_public_key != public_key.0 {
        return Err(IronfishError::InvalidBalance);
    }

    Ok(())
}

pub fn batch_verify_transactions<'a>(
    transactions: impl IntoIterator<Item = &'a Transaction>,
) -> Result<(), IronfishError> {
    let mut spend_verifier = Verifier::<Bls12>::new();
    let mut output_verifier = Verifier::<Bls12>::new();

    for transaction in transactions {
        // Context to accumulate a signature of all the spends and outputs and
        // guarantee they are part of this transaction, unmodified.
        let mut binding_verification_key = ExtendedPoint::identity();

        let hash_to_verify_signature = transaction.transaction_signature_hash();

        for spend in transaction.spends.iter() {
            spend.verify_value_commitment()?;

            let public_inputs = spend.public_inputs();
            spend_verifier.queue((&spend.proof, &public_inputs[..]));

            binding_verification_key += spend.value_commitment;

            spend.verify_signature(&hash_to_verify_signature)?;
        }

        for output in transaction.outputs.iter() {
            output.verify_value_commitment()?;

            let public_inputs = output.public_inputs();
            output_verifier.queue((&output.proof, &public_inputs[..]));

            binding_verification_key -= output.merkle_note.value_commitment;
        }

        transaction.verify_binding_signature(&binding_verification_key)?;
    }

    spend_verifier.verify(&mut OsRng, &SAPLING.spend_params.vk)?;

    output_verifier.verify(&mut OsRng, &SAPLING.output_params.vk)?;

    Ok(())
}
