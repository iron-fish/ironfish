/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use blstrs::Bls12;
use ff::Field;
use outputs::OutputBuilder;
use spends::{SpendBuilder, UnsignedSpendDescription};
use value_balances::ValueBalances;

use crate::{
    assets::{
        asset::Asset,
        asset_identifier::{AssetIdentifier, NATIVE_ASSET},
    },
    errors::{IronfishError, IronfishErrorKind},
    keys::{PublicAddress, SaplingKey},
    note::Note,
    sapling_bls12::SAPLING,
    witness::WitnessTrait,
    OutputDescription, SpendDescription,
};

use bellperson::groth16::{verify_proofs_batch, PreparedVerifyingKey};
use blake2b_simd::Params as Blake2b;
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use group::GroupEncoding;
use jubjub::ExtendedPoint;
use rand::{rngs::OsRng, thread_rng};

use ironfish_zkp::{
    constants::{
        NATIVE_VALUE_COMMITMENT_GENERATOR, SPENDING_KEY_GENERATOR,
        VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
    },
    redjubjub::{self, PrivateKey, PublicKey, Signature},
};

use std::{
    io::{self, Write},
    iter,
    slice::Iter,
};

use self::{
    burns::{BurnBuilder, BurnDescription},
    mints::{MintBuilder, MintDescription, UnsignedMintDescription},
};

pub mod burns;
pub mod mints;
pub mod outputs;
pub mod spends;

mod utils;
mod value_balances;
mod version;

#[cfg(test)]
mod tests;

pub use version::TransactionVersion;

const SIGNATURE_HASH_PERSONALIZATION: &[u8; 8] = b"IFsighsh";
const TRANSACTION_SIGNATURE_VERSION: &[u8; 1] = &[0];
pub const TRANSACTION_SIGNATURE_SIZE: usize = 64;
pub const TRANSACTION_PUBLIC_KEY_SIZE: usize = 32;
pub const TRANSACTION_EXPIRATION_SIZE: usize = 4;
pub const TRANSACTION_FEE_SIZE: usize = 8;

/// A collection of spend and output proofs that can be signed and verified.
/// In general, all the spent values should add up to all the output values.
///
/// The Transaction is used while the spends and outputs are being constructed,
/// and contains working state that is used to create the transaction information.
///
/// The Transaction, below, contains the serializable version, without any
/// secret keys or state not needed for verifying.
pub struct ProposedTransaction {
    /// The transaction serialization version. This can be incremented when
    /// changes need to be made to the transaction format
    version: TransactionVersion,

    /// Builders for the proofs of the individual spends with all values required to calculate
    /// the signatures.
    spends: Vec<SpendBuilder>,

    /// Builders for proofs of the individual outputs with values required to calculate
    /// signatures. Note: This is commonly referred to as
    /// `outputs` in the literature.
    outputs: Vec<OutputBuilder>,

    /// Builders for proofs of the individual mints with all values required to
    /// calculate the signatures.
    mints: Vec<MintBuilder>,

    /// Descriptions containing the assets and value commitments to be burned.
    /// We do not need to use a builder here since we only need to handle
    /// balancing and effects are handled by outputs.
    burns: Vec<BurnBuilder>,

    /// The balance of all the spends minus all the outputs. The difference
    /// is the fee paid to the miner for mining the transaction.
    value_balances: ValueBalances,

    /// This is the sequence in the chain the transaction will expire at and be
    /// removed from the mempool. A value of 0 indicates the transaction will
    /// not expire.
    expiration: u32,

    /// The key used to sign the transaction and any descriptions that need
    /// signed.
    spender_key: SaplingKey,

    // randomness used for the transaction to calculate the randomized ak, which
    // allows us to verify the sender address is valid and stored in the notes
    // Used to add randomness to signature generation without leaking the
    // key. Referred to as `ar` in the literature.
    public_key_randomness: jubjub::Fr,
    // NOTE: If adding fields here, you may need to add fields to
    // signature hash method, and also to Transaction.
}

impl ProposedTransaction {
    pub fn new(spender_key: SaplingKey, version: TransactionVersion) -> Self {
        Self {
            version,
            spends: vec![],
            outputs: vec![],
            mints: vec![],
            burns: vec![],
            value_balances: ValueBalances::new(),
            expiration: 0,
            spender_key,
            public_key_randomness: jubjub::Fr::random(thread_rng()),
        }
    }

    /// Spend the note owned by spender_key at the given witness location.
    pub fn add_spend(
        &mut self,
        note: Note,
        witness: &dyn WitnessTrait,
    ) -> Result<(), IronfishError> {
        self.value_balances
            .add(note.asset_id(), note.value().try_into()?)?;

        self.spends.push(SpendBuilder::new(note, witness));

        Ok(())
    }

    /// Create a proof of a new note owned by the recipient in this
    /// transaction.
    pub fn add_output(&mut self, note: Note) -> Result<(), IronfishError> {
        self.value_balances
            .subtract(note.asset_id(), note.value().try_into()?)?;

        self.outputs.push(OutputBuilder::new(note));

        Ok(())
    }

    pub fn add_mint(&mut self, asset: Asset, value: u64) -> Result<(), IronfishError> {
        self.value_balances.add(asset.id(), value.try_into()?)?;

        self.mints.push(MintBuilder::new(asset, value));

        Ok(())
    }

    pub fn add_mint_with_new_owner(
        &mut self,
        asset: Asset,
        value: u64,
        new_owner: PublicAddress,
    ) -> Result<(), IronfishError> {
        self.value_balances.add(asset.id(), value.try_into()?)?;

        let mut mint_builder = MintBuilder::new(asset, value);
        mint_builder.transfer_ownership_to(new_owner);
        self.mints.push(mint_builder);

        Ok(())
    }

    pub fn add_burn(&mut self, asset_id: AssetIdentifier, value: u64) -> Result<(), IronfishError> {
        self.value_balances.subtract(&asset_id, value.try_into()?)?;

        self.burns.push(BurnBuilder::new(asset_id, value));

        Ok(())
    }

    /// Post the transaction. This performs a bit of validation, and signs
    /// the spends with a signature that proves the spends are part of this
    /// transaction.
    ///
    /// Transaction fee is the amount the spender wants to send to the miner
    /// for mining this transaction. This has to be non-negative; sane miners
    /// wouldn't accept a transaction that takes money away from them.
    ///
    /// sum(spends) + sum(mints) - sum(outputs) - sum(burns) - intended_transaction_fee - change = 0
    /// aka: self.value_balance - intended_transaction_fee - change = 0
    pub fn post(
        &mut self,
        change_goes_to: Option<PublicAddress>,
        intended_transaction_fee: u64,
    ) -> Result<Transaction, IronfishError> {
        let mut change_notes = vec![];

        for (asset_id, value) in self.value_balances.iter() {
            let is_native_asset = asset_id == &NATIVE_ASSET;

            let change_amount = match is_native_asset {
                true => *value - i64::try_from(intended_transaction_fee)?,
                false => *value,
            };

            if change_amount < 0 {
                return Err(IronfishError::new(IronfishErrorKind::InvalidBalance));
            }
            if change_amount > 0 {
                let change_address =
                    change_goes_to.unwrap_or_else(|| self.spender_key.public_address());
                let change_note = Note::new(
                    change_address,
                    change_amount as u64, // we checked it was positive
                    "",
                    *asset_id,
                    self.spender_key.public_address(),
                );

                change_notes.push(change_note);
            }
        }

        for change_note in change_notes {
            self.add_output(change_note)?;
        }

        self._partial_post()
    }

    /// Special case for posting a miners fee transaction. Miner fee transactions
    /// are unique in that they generate currency. They do not have any spends
    /// or change and therefore have a negative transaction fee. In normal use,
    /// a miner would not accept such a transaction unless it was explicitly set
    /// as the miners fee.
    pub fn post_miners_fee(&mut self) -> Result<Transaction, IronfishError> {
        if !self.spends.is_empty()
            || self.outputs.len() != 1
            || !self.mints.is_empty()
            || !self.burns.is_empty()
        {
            return Err(IronfishError::new(
                IronfishErrorKind::InvalidMinersFeeTransaction,
            ));
        }
        self.post_miners_fee_unchecked()
    }

    /// Do not call this directly -- see post_miners_fee.
    pub fn post_miners_fee_unchecked(&mut self) -> Result<Transaction, IronfishError> {
        // Set note_encryption_keys to a constant value on the outputs
        for output in &mut self.outputs {
            output.set_is_miners_fee();
        }
        self._partial_post()
    }

    /// Get the expiration sequence for this transaction
    pub fn expiration(&self) -> u32 {
        self.expiration
    }

    /// Set the sequence to expire the transaction from the mempool.
    pub fn set_expiration(&mut self, sequence: u32) {
        self.expiration = sequence;
    }

    // Post transaction without much validation.
    fn _partial_post(&self) -> Result<Transaction, IronfishError> {
        // Generate randomized public key

        // The public key after randomization has been applied. This is used
        // during signature verification. Referred to as `rk` in the literature
        // Calculated from the authorizing key and the public_key_randomness.
        let randomized_public_key =
            redjubjub::PublicKey(self.spender_key.view_key.authorizing_key.into())
                .randomize(self.public_key_randomness, *SPENDING_KEY_GENERATOR);

        // Build descriptions
        let mut unsigned_spends = Vec::with_capacity(self.spends.len());
        for spend in &self.spends {
            unsigned_spends.push(spend.build(
                &self.spender_key,
                &self.public_key_randomness,
                &randomized_public_key,
            )?);
        }

        let mut output_descriptions = Vec::with_capacity(self.outputs.len());
        for output in &self.outputs {
            output_descriptions.push(output.build(
                &self.spender_key,
                &self.public_key_randomness,
                &randomized_public_key,
            )?);
        }

        let mut unsigned_mints = Vec::with_capacity(self.mints.len());
        for mint in &self.mints {
            unsigned_mints.push(mint.build(
                &self.spender_key,
                &self.public_key_randomness,
                &randomized_public_key,
            )?);
        }

        let mut burn_descriptions = Vec::with_capacity(self.burns.len());
        for burn in &self.burns {
            burn_descriptions.push(burn.build());
        }

        // Create the transaction signature hash
        let data_to_sign = self.transaction_signature_hash(
            &unsigned_spends,
            &output_descriptions,
            &unsigned_mints,
            &burn_descriptions,
        )?;

        // Create and verify binding signature keys
        let (binding_signature_private_key, binding_signature_public_key) =
            self.binding_signature_keys(&unsigned_mints, &burn_descriptions)?;

        let binding_signature = self.binding_signature(
            &binding_signature_private_key,
            &binding_signature_public_key,
            &data_to_sign,
        )?;

        // Sign spends now that we have the data needed to be signed
        let mut spend_descriptions = Vec::with_capacity(unsigned_spends.len());
        for spend in unsigned_spends.drain(0..) {
            spend_descriptions.push(spend.sign(&self.spender_key, &data_to_sign)?);
        }

        // Sign mints now that we have the data needed to be signed
        let mut mint_descriptions = Vec::with_capacity(unsigned_mints.len());
        for mint in unsigned_mints.drain(0..) {
            mint_descriptions.push(mint.sign(&self.spender_key, &data_to_sign)?);
        }

        Ok(Transaction {
            version: self.version,
            expiration: self.expiration,
            fee: *self.value_balances.fee(),
            spends: spend_descriptions,
            outputs: output_descriptions,
            mints: mint_descriptions,
            burns: burn_descriptions,
            binding_signature,
            randomized_public_key,
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
        mints: &[UnsignedMintDescription],
        burns: &[BurnDescription],
    ) -> Result<[u8; 32], IronfishError> {
        let mut hasher = Blake2b::new()
            .hash_length(32)
            .personal(SIGNATURE_HASH_PERSONALIZATION)
            .to_state();

        hasher.update(TRANSACTION_SIGNATURE_VERSION);
        self.version.write(&mut hasher)?;
        hasher.write_u32::<LittleEndian>(self.expiration)?;
        hasher.write_i64::<LittleEndian>(*self.value_balances.fee())?;

        let randomized_public_key =
            redjubjub::PublicKey(self.spender_key.view_key.authorizing_key.into())
                .randomize(self.public_key_randomness, *SPENDING_KEY_GENERATOR);

        hasher.write_all(&randomized_public_key.0.to_bytes())?;

        for spend in spends {
            spend.description.serialize_signature_fields(&mut hasher)?;
        }

        for output in outputs {
            output.serialize_signature_fields(&mut hasher)?;
        }

        for mint in mints {
            mint.description
                .serialize_signature_fields(&mut hasher, self.version)?;
        }

        for burn in burns {
            burn.serialize_signature_fields(&mut hasher)?;
        }

        let mut hash_result = [0; 32];
        hash_result[..].clone_from_slice(hasher.finalize().as_ref());
        Ok(hash_result)
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
        let mut data_to_be_signed = [0u8; TRANSACTION_SIGNATURE_SIZE];
        data_to_be_signed[..TRANSACTION_PUBLIC_KEY_SIZE].copy_from_slice(&public_key.0.to_bytes());
        data_to_be_signed[TRANSACTION_PUBLIC_KEY_SIZE..]
            .copy_from_slice(transaction_signature_hash);

        Ok(private_key.sign(
            &data_to_be_signed,
            &mut OsRng,
            *VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
        ))
    }

    fn binding_signature_keys(
        &self,
        mints: &[UnsignedMintDescription],
        burns: &[BurnDescription],
    ) -> Result<(redjubjub::PrivateKey, redjubjub::PublicKey), IronfishError> {
        // A "private key" manufactured from a bunch of randomness added for each
        // spend and output.
        let mut binding_signature_key = jubjub::Fr::zero();

        // A "public key" manufactured from a combination of the values of each
        // description and the same randomness as above
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
            PublicKey::from_private(&private_key, *VALUE_COMMITMENT_RANDOMNESS_GENERATOR);

        let value_balance =
            self.calculate_value_balance(&binding_verification_key, mints, burns)?;

        // Confirm that the public key derived from the binding signature key matches
        // the final value balance point. The binding verification key is how verifiers
        // check the consistency of the values in a transaction.
        if value_balance != public_key.0 {
            return Err(IronfishError::new(IronfishErrorKind::InvalidBalance));
        }

        Ok((private_key, public_key))
    }

    /// Small wrapper around [`calculate_value_balance`] to handle [`UnsignedMintDescription`]
    fn calculate_value_balance(
        &self,
        binding_verification_key: &ExtendedPoint,
        mints: &[UnsignedMintDescription],
        burns: &[BurnDescription],
    ) -> Result<ExtendedPoint, IronfishError> {
        let mints_descriptions: Vec<MintDescription> =
            mints.iter().map(|m| m.description.clone()).collect();

        calculate_value_balance(
            binding_verification_key,
            *self.value_balances.fee(),
            &mints_descriptions,
            burns,
        )
    }
}

/// A transaction that has been published and can be read by anyone, not storing
/// any of the working data or private keys used in creating the proofs.
///
/// This is the serializable form of a transaction.
#[derive(Clone)]
pub struct Transaction {
    /// The transaction serialization version. This can be incremented when
    /// changes need to be made to the transaction format
    version: TransactionVersion,

    /// The balance of total spends - outputs, which is the amount that the miner gets to keep
    fee: i64,

    /// List of spends, or input notes, that have been destroyed.
    spends: Vec<SpendDescription>,

    /// List of outputs, or output notes that have been created.
    outputs: Vec<OutputDescription>,

    /// List of mint descriptions
    mints: Vec<MintDescription>,

    /// List of burn descriptions
    burns: Vec<BurnDescription>,

    /// Signature calculated from accumulating randomness with all the spends
    /// and outputs when the transaction was created.
    binding_signature: Signature,

    /// This is the sequence in the chain the transaction will expire at and be
    /// removed from the mempool. A value of 0 indicates the transaction will
    /// not expire.
    expiration: u32,

    /// Randomized public key of the sender of the Transaction
    /// currently this value is the same for all spends[].owner and outputs[].sender
    /// This is used during verification of SpendDescriptions and OutputDescriptions, as
    /// well as signing of the SpendDescriptions. Referred to as
    /// `rk` in the literature Calculated from the authorizing key and
    /// the public_key_randomness.
    randomized_public_key: redjubjub::PublicKey,
}

impl Transaction {
    /// Load a Transaction from a Read implementation (e.g: socket, file)
    /// This is the main entry-point when reconstructing a serialized transaction
    /// for verifying.
    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let version = TransactionVersion::read(&mut reader)?;
        let num_spends = reader.read_u64::<LittleEndian>()?;
        let num_outputs = reader.read_u64::<LittleEndian>()?;
        let num_mints = reader.read_u64::<LittleEndian>()?;
        let num_burns = reader.read_u64::<LittleEndian>()?;
        let fee = reader.read_i64::<LittleEndian>()?;
        let expiration = reader.read_u32::<LittleEndian>()?;
        let randomized_public_key = redjubjub::PublicKey::read(&mut reader)?;

        let mut spends = Vec::with_capacity(num_spends as usize);
        for _ in 0..num_spends {
            spends.push(SpendDescription::read(&mut reader)?);
        }

        let mut outputs = Vec::with_capacity(num_outputs as usize);
        for _ in 0..num_outputs {
            outputs.push(OutputDescription::read(&mut reader)?);
        }

        let mut mints = Vec::with_capacity(num_mints as usize);
        for _ in 0..num_mints {
            mints.push(MintDescription::read(&mut reader, version)?);
        }

        let mut burns = Vec::with_capacity(num_burns as usize);
        for _ in 0..num_burns {
            burns.push(BurnDescription::read(&mut reader)?);
        }

        let binding_signature = Signature::read(&mut reader)?;

        Ok(Transaction {
            version,
            fee,
            spends,
            outputs,
            mints,
            burns,
            binding_signature,
            expiration,
            randomized_public_key,
        })
    }

    /// Store the bytes of this transaction in the given writer. This is used
    /// to serialize transactions to file or network
    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        self.version.write(&mut writer)?;
        writer.write_u64::<LittleEndian>(self.spends.len() as u64)?;
        writer.write_u64::<LittleEndian>(self.outputs.len() as u64)?;
        writer.write_u64::<LittleEndian>(self.mints.len() as u64)?;
        writer.write_u64::<LittleEndian>(self.burns.len() as u64)?;
        writer.write_i64::<LittleEndian>(self.fee)?;
        writer.write_u32::<LittleEndian>(self.expiration)?;
        writer.write_all(&self.randomized_public_key.0.to_bytes())?;

        for spend in self.spends.iter() {
            spend.write(&mut writer)?;
        }

        for output in self.outputs.iter() {
            output.write(&mut writer)?;
        }

        for mints in self.mints.iter() {
            mints.write(&mut writer, self.version)?;
        }

        for burns in self.burns.iter() {
            burns.write(&mut writer)?;
        }

        self.binding_signature.write(&mut writer)?;

        Ok(())
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

    pub fn mints(&self) -> &Vec<MintDescription> {
        &self.mints
    }

    pub fn burns(&self) -> &Vec<BurnDescription> {
        &self.burns
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
    pub fn expiration(&self) -> u32 {
        self.expiration
    }

    /// Get the expiration sequence for this transaction
    pub fn randomized_public_key(&self) -> &redjubjub::PublicKey {
        &self.randomized_public_key
    }

    /// Calculate a hash of the transaction data. This hash was signed by the
    /// private keys when the transaction was constructed, and will now be
    /// reconstructed to verify the signature.
    pub fn transaction_signature_hash(&self) -> Result<[u8; 32], IronfishError> {
        let mut hasher = Blake2b::new()
            .hash_length(32)
            .personal(SIGNATURE_HASH_PERSONALIZATION)
            .to_state();
        hasher.update(TRANSACTION_SIGNATURE_VERSION);
        self.version.write(&mut hasher)?;
        hasher.write_u32::<LittleEndian>(self.expiration)?;
        hasher.write_i64::<LittleEndian>(self.fee)?;
        hasher.write_all(&self.randomized_public_key.0.to_bytes())?;

        for spend in self.spends.iter() {
            spend.serialize_signature_fields(&mut hasher)?;
        }

        for output in self.outputs.iter() {
            output.serialize_signature_fields(&mut hasher)?;
        }

        for mint in self.mints.iter() {
            mint.serialize_signature_fields(&mut hasher, self.version)?;
        }

        for burn in self.burns.iter() {
            burn.serialize_signature_fields(&mut hasher)?;
        }

        let mut hash_result = [0; 32];
        hash_result[..].clone_from_slice(hasher.finalize().as_ref());
        Ok(hash_result)
    }

    /// Confirm that this transaction was signed by the values it contains.
    /// Called from the public verify function.
    fn verify_binding_signature(
        &self,
        binding_verification_key: &ExtendedPoint,
    ) -> Result<(), IronfishError> {
        let value_balance =
            calculate_value_balance(binding_verification_key, self.fee, &self.mints, &self.burns)?;

        let mut data_to_verify_signature = [0; 64];
        data_to_verify_signature[..32].copy_from_slice(&value_balance.to_bytes());
        data_to_verify_signature[32..].copy_from_slice(&self.transaction_signature_hash()?);

        if !redjubjub::PublicKey(value_balance).verify(
            &data_to_verify_signature,
            &self.binding_signature,
            *VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
        ) {
            return Err(IronfishError::new(IronfishErrorKind::InvalidSignature));
        }

        Ok(())
    }
}

/// Convert the integer value to a point on the Jubjub curve, accounting for
/// negative values
fn fee_to_point(value: i64) -> Result<ExtendedPoint, IronfishError> {
    // Can only construct edwards point on positive numbers, so need to
    // add and possibly negate later
    let is_negative = value.is_negative();
    let abs = match value.checked_abs() {
        Some(a) => a as u64,
        None => return Err(IronfishError::new(IronfishErrorKind::IllegalValue)),
    };

    let mut value_balance = *NATIVE_VALUE_COMMITMENT_GENERATOR * jubjub::Fr::from(abs);

    if is_negative {
        value_balance = -value_balance;
    }

    Ok(value_balance.into())
}

/// Calculate balance of input and output values.
///
/// Does not confirm that the transactions add up to zero. The calculation
/// for fees and change happens elsewhere.
fn calculate_value_balance(
    binding_verification_key: &ExtendedPoint,
    fee: i64,
    mints: &[MintDescription],
    burns: &[BurnDescription],
) -> Result<ExtendedPoint, IronfishError> {
    let fee_point = fee_to_point(fee)?;

    let mut value_balance_point = binding_verification_key - fee_point;

    for mint in mints {
        let mint_generator = mint.asset.value_commitment_generator();
        value_balance_point += mint_generator * jubjub::Fr::from(mint.value);
    }

    for burn in burns {
        let burn_generator = burn.asset_id.value_commitment_generator();
        value_balance_point -= burn_generator * jubjub::Fr::from(burn.value);
    }

    Ok(value_balance_point)
}

/// A convenience wrapper method around [`batch_verify_transactions`] for single
/// transactions
pub fn verify_transaction(transaction: &Transaction) -> Result<(), IronfishError> {
    batch_verify_transactions(iter::once(transaction))
}

fn internal_batch_verify_transactions<'a>(
    transactions: impl IntoIterator<Item = &'a Transaction>,
    spend_verifying_key: &PreparedVerifyingKey<Bls12>,
    output_verifying_key: &PreparedVerifyingKey<Bls12>,
    mint_verifying_key: &PreparedVerifyingKey<Bls12>,
) -> Result<(), IronfishError> {
    let mut spend_proofs = vec![];
    let mut spend_public_inputs = vec![];

    let mut output_proofs = vec![];
    let mut output_public_inputs = vec![];

    let mut mint_proofs = vec![];
    let mut mint_public_inputs = vec![];

    for transaction in transactions {
        // Context to accumulate a signature of all the spends and outputs and
        // guarantee they are part of this transaction, unmodified.
        let mut binding_verification_key = ExtendedPoint::identity();

        let hash_to_verify_signature = transaction.transaction_signature_hash()?;

        for spend in transaction.spends.iter() {
            spend.partial_verify()?;

            spend_proofs.push(&spend.proof);
            spend_public_inputs.push(
                spend
                    .public_inputs(transaction.randomized_public_key())
                    .to_vec(),
            );

            binding_verification_key += spend.value_commitment;

            spend.verify_signature(
                &hash_to_verify_signature,
                transaction.randomized_public_key(),
            )?;
        }

        for output in transaction.outputs.iter() {
            output.partial_verify()?;

            output_proofs.push(&output.proof);
            output_public_inputs.push(
                output
                    .public_inputs(transaction.randomized_public_key())
                    .to_vec(),
            );

            binding_verification_key -= output.merkle_note.value_commitment;
        }

        for mint in transaction.mints.iter() {
            mint.partial_verify()?;

            mint_proofs.push(&mint.proof);
            mint_public_inputs.push(
                mint.public_inputs(transaction.randomized_public_key())
                    .to_vec(),
            );

            mint.verify_signature(
                &hash_to_verify_signature,
                transaction.randomized_public_key(),
            )?;
        }

        transaction.verify_binding_signature(&binding_verification_key)?;
    }

    if !spend_proofs.is_empty()
        && !verify_proofs_batch(
            spend_verifying_key,
            &mut OsRng,
            &spend_proofs[..],
            &spend_public_inputs[..],
        )?
    {
        return Err(IronfishError::new(IronfishErrorKind::InvalidSpendProof));
    }
    if !output_proofs.is_empty()
        && !verify_proofs_batch(
            output_verifying_key,
            &mut OsRng,
            &output_proofs[..],
            &output_public_inputs[..],
        )?
    {
        return Err(IronfishError::new(IronfishErrorKind::InvalidOutputProof));
    }
    if !mint_proofs.is_empty()
        && !verify_proofs_batch(
            mint_verifying_key,
            &mut OsRng,
            &mint_proofs[..],
            &mint_public_inputs[..],
        )?
    {
        return Err(IronfishError::new(IronfishErrorKind::InvalidOutputProof));
    }

    Ok(())
}

/// Validate the transaction. Confirms that:
///  *  Each of the spend proofs has the inputs it says it has
///  *  Each of the output proofs has the inputs it says it has
///  *  Each of the mint proofs has the inputs it says it has
///  *  Each of the spend proofs was signed by the owner
///  *  Each of the mint proofs was signed by the owner
///  *  The entire transaction was signed with a binding signature
///     containing those proofs (and only those proofs)
///
pub fn batch_verify_transactions<'a>(
    transactions: impl IntoIterator<Item = &'a Transaction>,
) -> Result<(), IronfishError> {
    internal_batch_verify_transactions(
        transactions,
        &SAPLING.spend_verifying_key,
        &SAPLING.output_verifying_key,
        &SAPLING.mint_verifying_key,
    )
}
