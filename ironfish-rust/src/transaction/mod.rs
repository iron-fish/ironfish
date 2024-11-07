/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::IronfishError,
    transaction::{burns::BurnDescription, mints::MintDescription},
    OutputDescription, SpendDescription,
};
use blake2b_simd::Params as Blake2b;
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use group::GroupEncoding;
use ironfish_zkp::redjubjub::{self, Signature};
use std::{
    io::{self, Write},
    slice::Iter,
};

#[cfg(feature = "transaction-proofs")]
use crate::errors::IronfishErrorKind;
#[cfg(feature = "transaction-proofs")]
use ironfish_jubjub::ExtendedPoint;
#[cfg(feature = "transaction-proofs")]
use ironfish_zkp::constants::{
    NATIVE_VALUE_COMMITMENT_GENERATOR, VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
};

pub mod burns;
pub mod mints;
pub mod outputs;
pub mod spends;
pub mod unsigned;

mod version;

#[cfg(feature = "transaction-proofs")]
mod proposed;
#[cfg(feature = "transaction-proofs")]
mod value_balances;
#[cfg(feature = "transaction-proofs")]
mod verify;

#[cfg(test)]
mod tests;

pub use version::TransactionVersion;

#[cfg(feature = "transaction-proofs")]
pub use proposed::ProposedTransaction;
#[cfg(feature = "transaction-proofs")]
pub use verify::batch_verify_transactions;
#[cfg(feature = "transaction-proofs")]
pub use verify::verify_transaction;

const SIGNATURE_HASH_PERSONALIZATION: &[u8; 8] = b"IFsighsh";
const TRANSACTION_SIGNATURE_VERSION: &[u8; 1] = &[0];
pub const TRANSACTION_SIGNATURE_SIZE: usize = 64;
pub const TRANSACTION_PUBLIC_KEY_SIZE: usize = 32;
pub const TRANSACTION_EXPIRATION_SIZE: usize = 4;
pub const TRANSACTION_FEE_SIZE: usize = 8;

/// A transaction that has been published and can be read by anyone, not storing
/// any of the working data or private keys used in creating the proofs.
///
/// This is the serializable form of a transaction.
#[derive(Clone, Debug)]
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
    pub fn write<W: Write>(&self, mut writer: W) -> Result<(), IronfishError> {
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
    #[cfg(feature = "transaction-proofs")]
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
#[cfg(feature = "transaction-proofs")]
fn fee_to_point(value: i64) -> Result<ExtendedPoint, IronfishError> {
    // Can only construct edwards point on positive numbers, so need to
    // add and possibly negate later
    let is_negative = value.is_negative();
    let abs = match value.checked_abs() {
        Some(a) => a as u64,
        None => return Err(IronfishError::new(IronfishErrorKind::IllegalValue)),
    };

    let mut value_balance = *NATIVE_VALUE_COMMITMENT_GENERATOR * ironfish_jubjub::Fr::from(abs);

    if is_negative {
        value_balance = -value_balance;
    }

    Ok(value_balance.into())
}

/// Calculate balance of input and output values.
///
/// Does not confirm that the transactions add up to zero. The calculation
/// for fees and change happens elsewhere.
#[cfg(feature = "transaction-proofs")]
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
        value_balance_point += mint_generator * ironfish_jubjub::Fr::from(mint.value);
    }

    for burn in burns {
        let burn_generator = burn.asset_id.value_commitment_generator();
        value_balance_point -= burn_generator * ironfish_jubjub::Fr::from(burn.value);
    }

    Ok(value_balance_point)
}
