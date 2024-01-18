/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use group::GroupEncoding;
use ironfish_frost::frost::{round1::SigningCommitments, Identifier, SigningPackage};

use ironfish_zkp::redjubjub::{self, Signature};
use std::{
    collections::BTreeMap,
    io::{self, Write},
};

use crate::{
    errors::IronfishError, serializing::read_scalar, transaction::Blake2b, OutputDescription,
    SaplingKey, Transaction,
};

use super::{
    burns::BurnDescription, mints::UnsignedMintDescription, spends::UnsignedSpendDescription,
    TransactionVersion, SIGNATURE_HASH_PERSONALIZATION, TRANSACTION_SIGNATURE_VERSION,
};

#[derive(Clone)]
pub struct UnsignedTransaction {
    /// The transaction serialization version. This can be incremented when
    /// changes need to be made to the transaction format
    pub(crate) version: TransactionVersion,

    /// List of spends, or input notes, that have been destroyed.
    pub(crate) spends: Vec<UnsignedSpendDescription>,

    /// List of outputs, or output notes that have been created.
    pub(crate) outputs: Vec<OutputDescription>,

    /// List of mint descriptions
    pub(crate) mints: Vec<UnsignedMintDescription>,

    /// List of burn descriptions
    pub(crate) burns: Vec<BurnDescription>,

    /// Signature calculated from accumulating randomness with all the spends
    /// and outputs when the transaction was created.
    pub(crate) binding_signature: Signature,

    /// This is the sequence in the chain the transaction will expire at and be
    /// removed from the mempool. A value of 0 indicates the transaction will
    /// not expire.
    pub(crate) expiration: u32,

    /// Randomized public key of the sender of the Transaction
    /// currently this value is the same for all spends[].owner and outputs[].sender
    /// This is used during verification of SpendDescriptions and OutputDescriptions, as
    /// well as signing of the SpendDescriptions. Referred to as
    /// `rk` in the literature Calculated from the authorizing key and
    /// the public_key_randomness.
    pub(crate) randomized_public_key: redjubjub::PublicKey,

    // TODO: Verify if this is actually okay to store on the unsigned transaction
    pub(crate) public_key_randomness: jubjub::Fr,

    /// The balance of total spends - outputs, which is the amount that the miner gets to keep
    pub(crate) fee: i64,
}

impl UnsignedTransaction {
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
        let public_key_randomness = read_scalar(&mut reader)?;

        let mut spends = Vec::with_capacity(num_spends as usize);
        for _ in 0..num_spends {
            spends.push(UnsignedSpendDescription::read(&mut reader)?);
        }

        let mut outputs = Vec::with_capacity(num_outputs as usize);
        for _ in 0..num_outputs {
            outputs.push(OutputDescription::read(&mut reader)?);
        }

        let mut mints = Vec::with_capacity(num_mints as usize);
        for _ in 0..num_mints {
            mints.push(UnsignedMintDescription::read(&mut reader, version)?);
        }

        let mut burns = Vec::with_capacity(num_burns as usize);
        for _ in 0..num_burns {
            burns.push(BurnDescription::read(&mut reader)?);
        }

        let binding_signature = Signature::read(&mut reader)?;

        Ok(UnsignedTransaction {
            version,
            fee,
            spends,
            outputs,
            mints,
            burns,
            binding_signature,
            expiration,
            randomized_public_key,
            public_key_randomness,
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
        writer.write_all(&self.public_key_randomness.to_bytes())?;

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
            spend.description.serialize_signature_fields(&mut hasher)?;
        }

        for output in self.outputs.iter() {
            output.serialize_signature_fields(&mut hasher)?;
        }

        for mint in self.mints.iter() {
            mint.description
                .serialize_signature_fields(&mut hasher, self.version)?;
        }

        for burn in self.burns.iter() {
            burn.serialize_signature_fields(&mut hasher)?;
        }

        let mut hash_result = [0; 32];
        hash_result[..].clone_from_slice(hasher.finalize().as_ref());
        Ok(hash_result)
    }

    // Post transaction without much validation.
    pub fn sign(&self, spender_key: &SaplingKey) -> Result<Transaction, IronfishError> {
        // Create the transaction signature hash
        let data_to_sign = self.transaction_signature_hash()?;

        // Sign spends now that we have the data needed to be signed
        let mut spend_descriptions = Vec::with_capacity(self.spends.len());
        for spend in self.spends.clone() {
            spend_descriptions.push(spend.sign(spender_key, &data_to_sign)?);
        }

        // Sign mints now that we have the data needed to be signed
        let mut mint_descriptions = Vec::with_capacity(self.mints.len());
        for mint in self.mints.clone() {
            mint_descriptions.push(mint.sign(spender_key, &data_to_sign)?);
        }

        Ok(Transaction {
            version: self.version,
            expiration: self.expiration,
            fee: self.fee,
            spends: spend_descriptions,
            outputs: self.outputs.clone(),
            mints: mint_descriptions,
            burns: self.burns.clone(),
            binding_signature: self.binding_signature,
            randomized_public_key: self.randomized_public_key.clone(),
        })
    }

    // Creates frost signing package for use in round two of FROST multisig protocol
    // only applicable for multisig transactions
    pub fn signing_package(
        &self,
        commitments: BTreeMap<Identifier, SigningCommitments>,
    ) -> Result<SigningPackage, IronfishError> {
        // Create the transaction signature hash
        let data_to_sign = self.transaction_signature_hash()?;
        Ok(SigningPackage::new(commitments, &data_to_sign))
    }
}
