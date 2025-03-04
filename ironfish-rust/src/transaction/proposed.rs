/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    assets::{
        asset::Asset,
        asset_identifier::{AssetIdentifier, NATIVE_ASSET},
    },
    errors::{IronfishError, IronfishErrorKind},
    keys::{EphemeralKeyPair, PublicAddress, SaplingKey},
    note::Note,
    transaction::{
        burns::{BurnBuilder, BurnDescription},
        calculate_value_balance,
        mints::MintDescription,
        mints::{MintBuilder, UnsignedMintDescription},
        outputs::{OutputBuilder, OutputDescription},
        spends::{SpendBuilder, UnsignedSpendDescription},
        unsigned::UnsignedTransaction,
        value_balances::ValueBalances,
        Transaction, TransactionVersion, SIGNATURE_HASH_PERSONALIZATION,
        TRANSACTION_PUBLIC_KEY_SIZE, TRANSACTION_SIGNATURE_SIZE, TRANSACTION_SIGNATURE_VERSION,
    },
    witness::WitnessTrait,
    OutgoingViewKey, ViewKey,
};
use blake2b_simd::Params as Blake2b;
use byteorder::{LittleEndian, WriteBytesExt};
use ff::Field;
use group::GroupEncoding;
use ironfish_jubjub::ExtendedPoint;
use ironfish_zkp::{
    constants::{SPENDING_KEY_GENERATOR, VALUE_COMMITMENT_RANDOMNESS_GENERATOR},
    proofs,
    redjubjub::{self, Signature},
    ProofGenerationKey,
};
use rand::{rngs::OsRng, thread_rng};
use std::io::Write;

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
    pub(super) version: TransactionVersion,

    /// Builders for the proofs of the individual spends with all values required to calculate
    /// the signatures.
    pub(super) spends: Vec<SpendBuilder>,

    /// Builders for proofs of the individual outputs with values required to calculate
    /// signatures. Note: This is commonly referred to as
    /// `outputs` in the literature.
    pub(super) outputs: Vec<OutputBuilder>,

    /// Builders for proofs of the individual mints with all values required to
    /// calculate the signatures.
    pub(super) mints: Vec<MintBuilder>,

    /// Descriptions containing the assets and value commitments to be burned.
    /// We do not need to use a builder here since we only need to handle
    /// balancing and effects are handled by outputs.
    pub(super) burns: Vec<BurnBuilder>,

    /// The balance of all the spends minus all the outputs. The difference
    /// is the fee paid to the miner for mining the transaction.
    pub(super) value_balances: ValueBalances,

    /// This is the sequence in the chain the transaction will expire at and be
    /// removed from the mempool. A value of 0 indicates the transaction will
    /// not expire.
    pub(super) expiration: u32,

    // randomness used for the transaction to calculate the randomized ak, which
    // allows us to verify the sender address is valid and stored in the notes
    // Used to add randomness to signature generation without leaking the
    // key. Referred to as `ar` in the literature.
    pub(super) public_key_randomness: ironfish_jubjub::Fr,
    // NOTE: If adding fields here, you may need to add fields to
    // signature hash method, and also to Transaction.
}

impl ProposedTransaction {
    pub fn new(version: TransactionVersion) -> Self {
        Self {
            version,
            spends: vec![],
            outputs: vec![],
            mints: vec![],
            burns: vec![],
            value_balances: ValueBalances::new(),
            expiration: 0,
            public_key_randomness: ironfish_jubjub::Fr::random(thread_rng()),
        }
    }

    /// Spend the note owned by spender_key at the given witness location.
    pub fn add_spend<W: WitnessTrait + ?Sized>(
        &mut self,
        note: Note,
        witness: &W,
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

    pub(super) fn add_change_notes(
        &mut self,
        change_goes_to: Option<PublicAddress>,
        public_address: PublicAddress,
        intended_transaction_fee: i64,
    ) -> Result<(), IronfishError> {
        let mut change_notes = vec![];

        for (asset_id, value) in self.value_balances.iter() {
            let is_native_asset = asset_id == &NATIVE_ASSET;

            let change_amount = match is_native_asset {
                true => *value - intended_transaction_fee,
                false => *value,
            };

            if change_amount < 0 {
                return Err(IronfishError::new(IronfishErrorKind::InvalidBalance));
            }
            if change_amount > 0 {
                let change_address = change_goes_to.unwrap_or(public_address);
                let change_note = Note::new(
                    change_address,
                    change_amount as u64, // we checked it was positive
                    "",
                    *asset_id,
                    public_address,
                );

                change_notes.push(change_note);
            }
        }
        for change_note in change_notes {
            self.add_output(change_note)?;
        }
        Ok(())
    }

    #[allow(clippy::type_complexity)]
    pub fn build_circuits(
        &mut self,
        proof_authorizing_key: ironfish_jubjub::Fr,
        view_key: ViewKey,
        intended_transaction_fee: i64,
        change_goes_to: Option<PublicAddress>,
    ) -> Result<
        (
            Vec<proofs::Spend>,
            Vec<(proofs::Output, EphemeralKeyPair)>,
            Vec<proofs::MintAsset>,
        ),
        IronfishError,
    > {
        let public_address = view_key.public_address()?;
        let proof_generation_key =
            ProofGenerationKey::new(view_key.authorizing_key, proof_authorizing_key);

        let is_miners_fee = self.outputs.iter().any(|output| output.get_is_miners_fee());
        if !is_miners_fee {
            self.add_change_notes(change_goes_to, public_address, intended_transaction_fee)?;
        }

        let spend_circuits = self
            .spends
            .iter()
            .map(|spend| spend.build_circuit(&proof_generation_key, &self.public_key_randomness))
            .collect();
        let output_circuits = self
            .outputs
            .iter()
            .map(|output| output.build_circuit(&proof_generation_key, &self.public_key_randomness))
            .collect();
        let mint_circuits = self
            .mints
            .iter()
            .map(|mint| mint.build_circuit(&proof_generation_key, &self.public_key_randomness))
            .collect();

        Ok((spend_circuits, output_circuits, mint_circuits))
    }

    pub fn build(
        &mut self,
        proof_authorizing_key: ironfish_jubjub::Fr,
        view_key: ViewKey,
        outgoing_view_key: OutgoingViewKey,
        intended_transaction_fee: i64,
        change_goes_to: Option<PublicAddress>,
    ) -> Result<UnsignedTransaction, IronfishError> {
        let public_address = view_key.public_address()?;

        let proof_generation_key =
            ProofGenerationKey::new(view_key.authorizing_key, proof_authorizing_key);

        // skip adding change notes if this is special case of a miners fee transaction
        let is_miners_fee = self.outputs.iter().any(|output| output.get_is_miners_fee());
        if !is_miners_fee {
            self.add_change_notes(change_goes_to, public_address, intended_transaction_fee)?;
        }

        // The public key after randomization has been applied. This is used
        // during signature verification. Referred to as `rk` in the literature
        // Calculated from the authorizing key and the public_key_randomness.
        let randomized_public_key = redjubjub::PublicKey(view_key.authorizing_key.into())
            .randomize(self.public_key_randomness, *SPENDING_KEY_GENERATOR);

        let mut unsigned_spends = Vec::with_capacity(self.spends.len());
        for spend in &self.spends {
            unsigned_spends.push(spend.build(
                &proof_generation_key,
                &view_key,
                &self.public_key_randomness,
                &randomized_public_key,
            )?);
        }

        let mut output_descriptions = Vec::with_capacity(self.outputs.len());
        for output in &self.outputs {
            output_descriptions.push(output.build(
                &proof_generation_key,
                &outgoing_view_key,
                &self.public_key_randomness,
                &randomized_public_key,
            )?);
        }

        let mut unsigned_mints = Vec::with_capacity(self.mints.len());
        for mint in &self.mints {
            unsigned_mints.push(mint.build(
                &proof_generation_key,
                &public_address,
                &self.public_key_randomness,
                &randomized_public_key,
            )?);
        }

        let mut burn_descriptions = Vec::with_capacity(self.burns.len());
        for burn in &self.burns {
            burn_descriptions.push(burn.build());
        }

        let data_to_sign = self.transaction_signature_hash(
            &unsigned_spends,
            &output_descriptions,
            &unsigned_mints,
            &burn_descriptions,
            &randomized_public_key,
        )?;

        // Create and verify binding signature keys
        let (binding_signature_private_key, binding_signature_public_key) =
            self.binding_signature_keys(&unsigned_mints, &burn_descriptions)?;

        let binding_signature = self.binding_signature(
            &binding_signature_private_key,
            &binding_signature_public_key,
            &data_to_sign,
        )?;

        Ok(UnsignedTransaction {
            burns: burn_descriptions,
            mints: unsigned_mints,
            outputs: output_descriptions,
            spends: unsigned_spends,
            version: self.version,
            fee: intended_transaction_fee,
            binding_signature,
            randomized_public_key,
            public_key_randomness: self.public_key_randomness,
            expiration: self.expiration,
        })
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
        spender_key: &SaplingKey,
        change_goes_to: Option<PublicAddress>,
        intended_transaction_fee: u64,
    ) -> Result<Transaction, IronfishError> {
        let i64_fee = i64::try_from(intended_transaction_fee)?;

        let unsigned = self.build(
            spender_key.proof_authorizing_key,
            spender_key.view_key().clone(),
            spender_key.outgoing_view_key().clone(),
            i64_fee,
            change_goes_to,
        )?;
        unsigned.sign(spender_key)
    }

    /// Special case for posting a miners fee transaction. Miner fee transactions
    /// are unique in that they generate currency. They do not have any spends
    /// or change and therefore have a negative transaction fee. In normal use,
    /// a miner would not accept such a transaction unless it was explicitly set
    /// as the miners fee.
    pub fn post_miners_fee(
        &mut self,
        spender_key: &SaplingKey,
    ) -> Result<Transaction, IronfishError> {
        if !self.spends.is_empty()
            || self.outputs.len() != 1
            || !self.mints.is_empty()
            || !self.burns.is_empty()
        {
            return Err(IronfishError::new(
                IronfishErrorKind::InvalidMinersFeeTransaction,
            ));
        }
        self.post_miners_fee_unchecked(spender_key)
    }

    /// Do not call this directly -- see post_miners_fee.
    pub fn post_miners_fee_unchecked(
        &mut self,
        spender_key: &SaplingKey,
    ) -> Result<Transaction, IronfishError> {
        // Set note_encryption_keys to a constant value on the outputs
        for output in &mut self.outputs {
            output.set_is_miners_fee();
        }
        let unsigned = self.build(
            spender_key.proof_authorizing_key,
            spender_key.view_key().clone(),
            spender_key.outgoing_view_key().clone(),
            *self.value_balances.fee(),
            None,
        )?;
        unsigned.sign(spender_key)
    }

    /// Get the expiration sequence for this transaction
    pub fn expiration(&self) -> u32 {
        self.expiration
    }

    /// Set the sequence to expire the transaction from the mempool.
    pub fn set_expiration(&mut self, sequence: u32) {
        self.expiration = sequence;
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
        randomized_public_key: &redjubjub::PublicKey,
    ) -> Result<[u8; 32], IronfishError> {
        let mut hasher = Blake2b::new()
            .hash_length(32)
            .personal(SIGNATURE_HASH_PERSONALIZATION)
            .to_state();

        hasher.update(TRANSACTION_SIGNATURE_VERSION);
        self.version.write(&mut hasher)?;
        hasher.write_u32::<LittleEndian>(self.expiration)?;
        hasher.write_i64::<LittleEndian>(*self.value_balances.fee())?;

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
        private_key: &redjubjub::PrivateKey,
        public_key: &redjubjub::PublicKey,
        transaction_signature_hash: &[u8; 32],
    ) -> Result<Signature, IronfishError> {
        // NOTE: The initial versions of the RedDSA specification and the redjubjub crate (that
        // we're using here) require the public key bytes to be prefixed to the message. The latest
        // version of the spec and the crate add the public key bytes automatically. Therefore, if
        // in the future we upgrade to a newer version of redjubjub, `data_to_be_signed` will have
        // to equal `transaction_signature_hash`
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
        let mut binding_signature_key = ironfish_jubjub::Fr::zero();

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

        let private_key = redjubjub::PrivateKey(binding_signature_key);
        let public_key = redjubjub::PublicKey::from_private(
            &private_key,
            *VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
        );

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
