/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::cell::RefCell;

use std::collections::BTreeMap;
use std::convert::TryInto;

use ironfish::assets::asset_identifier::AssetIdentifier;
use ironfish::frost::round1::SigningCommitments;
use ironfish::frost::round2::SignatureShare as FrostSignatureShare;
use ironfish::frost::Identifier;
use ironfish::frost_utils::signing_package::SigningPackage;
use ironfish::serializing::bytes_to_hex;
use ironfish::serializing::fr::FrSerializable;
use ironfish::serializing::hex_to_vec_bytes;
use ironfish::transaction::unsigned::UnsignedTransaction;
use ironfish::transaction::{
    batch_verify_transactions, TransactionVersion, TRANSACTION_EXPIRATION_SIZE,
    TRANSACTION_FEE_SIZE, TRANSACTION_PUBLIC_KEY_SIZE, TRANSACTION_SIGNATURE_SIZE,
};
use ironfish::{
    MerkleNoteHash, OutgoingViewKey, ProposedTransaction, PublicAddress, SaplingKey, Transaction,
    ViewKey,
};
use ironfish_frost::dkg::round3::PublicKeyPackage;
use ironfish_frost::signature_share::SignatureShare;
use ironfish_frost::signing_commitment::SigningCommitment;
use napi::{
    bindgen_prelude::{i64n, BigInt, Buffer, Env, Object, Result, Undefined},
    JsBuffer,
};
use napi_derive::napi;

use crate::to_napi_err;

use super::note::NativeNote;
use super::spend_proof::NativeSpendDescription;
use super::witness::JsWitness;
use super::{NativeAsset, ENCRYPTED_NOTE_LENGTH};
use ironfish::transaction::outputs::PROOF_SIZE;

#[napi]
pub const PROOF_LENGTH: u32 = PROOF_SIZE;

#[napi]
pub const TRANSACTION_SIGNATURE_LENGTH: u32 = TRANSACTION_SIGNATURE_SIZE as u32;

#[napi]
pub const TRANSACTION_PUBLIC_KEY_RANDOMNESS_LENGTH: u32 = TRANSACTION_PUBLIC_KEY_SIZE as u32;

#[napi]
pub const TRANSACTION_EXPIRATION_LENGTH: u32 = TRANSACTION_EXPIRATION_SIZE as u32;

#[napi]
pub const TRANSACTION_FEE_LENGTH: u32 = TRANSACTION_FEE_SIZE as u32;

#[napi]
pub const LATEST_TRANSACTION_VERSION: u8 = TransactionVersion::latest() as u8;

#[napi(js_name = "TransactionPosted")]
pub struct NativeTransactionPosted {
    transaction: Transaction,
}

#[napi]
impl NativeTransactionPosted {
    #[napi(constructor)]
    pub fn new(js_bytes: JsBuffer) -> Result<NativeTransactionPosted> {
        let bytes = js_bytes.into_value()?;

        let transaction = Transaction::read(bytes.as_ref()).map_err(to_napi_err)?;

        Ok(NativeTransactionPosted { transaction })
    }

    #[napi]
    pub fn serialize(&self) -> Result<Buffer> {
        let mut vec: Vec<u8> = vec![];
        self.transaction.write(&mut vec).map_err(to_napi_err)?;

        Ok(Buffer::from(vec))
    }

    #[napi]
    pub fn notes_length(&self) -> Result<i64> {
        let notes_len: i64 = self
            .transaction
            .outputs()
            .len()
            .try_into()
            .map_err(|_| to_napi_err("Value out of range"))?;

        Ok(notes_len)
    }

    #[napi]
    pub fn get_note(&self, index: i64) -> Result<Buffer> {
        let index_usize: usize = index
            .try_into()
            .map_err(|_| to_napi_err("Value out of range"))?;

        let proof = &self.transaction.outputs()[index_usize];
        let mut vec: Vec<u8> = Vec::with_capacity(ENCRYPTED_NOTE_LENGTH as usize);
        proof.merkle_note().write(&mut vec).map_err(to_napi_err)?;

        Ok(Buffer::from(vec))
    }

    #[napi]
    pub fn spends_length(&self) -> Result<i64> {
        let spends_len: i64 = self
            .transaction
            .spends()
            .len()
            .try_into()
            .map_err(|_| to_napi_err("Value out of range"))?;

        Ok(spends_len)
    }

    #[napi]
    pub fn get_spend(&self, index: i64) -> Result<NativeSpendDescription> {
        let index_usize: usize = index
            .try_into()
            .map_err(|_| to_napi_err("Value out of range"))?;

        let proof = &self.transaction.spends()[index_usize];

        let mut root_hash: Vec<u8> = vec![];

        MerkleNoteHash::new(proof.root_hash())
            .write(&mut root_hash)
            .map_err(to_napi_err)?;

        let nullifier = Buffer::from(proof.nullifier().to_vec());

        Ok(NativeSpendDescription {
            tree_size: proof.tree_size(),
            root_hash: Buffer::from(root_hash),
            nullifier,
        })
    }

    #[napi]
    pub fn fee(&self) -> i64n {
        i64n(self.transaction.fee())
    }

    #[napi]
    pub fn transaction_signature(&self) -> Result<Buffer> {
        let mut serialized_signature = vec![];
        self.transaction
            .binding_signature()
            .write(&mut serialized_signature)
            .map_err(to_napi_err)?;

        Ok(Buffer::from(serialized_signature))
    }

    #[napi]
    pub fn hash(&self) -> Result<Buffer> {
        let hash = self
            .transaction
            .transaction_signature_hash()
            .map_err(to_napi_err)?;

        Ok(Buffer::from(hash.as_ref()))
    }

    #[napi]
    pub fn expiration(&self) -> u32 {
        self.transaction.expiration()
    }
}

#[napi(js_name = "Transaction")]
pub struct NativeTransaction {
    transaction: ProposedTransaction,
}

#[napi]
impl NativeTransaction {
    #[napi(constructor)]
    pub fn new(version: u8) -> Result<Self> {
        let tx_version = version.try_into().map_err(to_napi_err)?;
        let transaction = ProposedTransaction::new(tx_version);
        Ok(NativeTransaction { transaction })
    }

    /// Create a proof of a new note owned by the recipient in this transaction.
    #[napi]
    pub fn output(&mut self, note: &NativeNote) -> Result<()> {
        self.transaction
            .add_output(note.note.clone())
            .map_err(to_napi_err)?;

        Ok(())
    }

    /// Spend the note owned by spender_hex_key at the given witness location.
    #[napi]
    pub fn spend(&mut self, env: Env, note: &NativeNote, witness: Object) -> Result<()> {
        let w = JsWitness {
            cx: RefCell::new(env),
            obj: witness,
        };

        self.transaction
            .add_spend(note.note.clone(), &w)
            .map_err(to_napi_err)?;

        Ok(())
    }

    /// Mint a new asset with a given value as part of this transaction.
    #[napi]
    pub fn mint(
        &mut self,
        asset: &NativeAsset,
        value: BigInt,
        transfer_ownership_to: Option<&str>,
    ) -> Result<()> {
        let value_u64 = value.get_u64().1;
        match transfer_ownership_to {
            None => self
                .transaction
                .add_mint(asset.asset, value_u64)
                .map_err(to_napi_err)?,
            Some(new_owner) => {
                let new_owner = PublicAddress::from_hex(new_owner).map_err(to_napi_err)?;
                self.transaction
                    .add_mint_with_new_owner(asset.asset, value_u64, new_owner)
                    .map_err(to_napi_err)?;
            }
        }

        Ok(())
    }

    /// Burn some supply of a given asset and value as part of this transaction.
    #[napi]
    pub fn burn(&mut self, asset_id_js_bytes: JsBuffer, value: BigInt) -> Result<()> {
        let asset_id_bytes = asset_id_js_bytes.into_value()?;
        let asset_id = AssetIdentifier::new(asset_id_bytes.as_ref().try_into().unwrap())
            .map_err(to_napi_err)?;
        let value_u64 = value.get_u64().1;
        self.transaction
            .add_burn(asset_id, value_u64)
            .map_err(to_napi_err)?;

        Ok(())
    }

    /// Special case for posting a miners fee transaction. Miner fee transactions
    /// are unique in that they generate currency. They do not have any spends
    /// or change and therefore have a negative transaction fee. In normal use,
    /// a miner would not accept such a transaction unless it was explicitly set
    /// as the miners fee.
    #[napi(js_name = "post_miners_fee")]
    pub fn post_miners_fee(&mut self, spender_hex_key: String) -> Result<Buffer> {
        let spender_key = SaplingKey::from_hex(&spender_hex_key).map_err(to_napi_err)?;
        let transaction = self
            .transaction
            .post_miners_fee(&spender_key)
            .map_err(to_napi_err)?;

        let mut vec: Vec<u8> = vec![];
        transaction.write(&mut vec).map_err(to_napi_err)?;
        Ok(Buffer::from(vec))
    }

    /// Used to generate invalid miners fee transactions for testing. Call
    /// post_miners_fee instead in user-facing code.
    #[napi(js_name = "_postMinersFeeUnchecked")]
    pub fn _post_miners_fee_unchecked(&mut self, spender_hex_key: String) -> Result<Buffer> {
        let spender_key = SaplingKey::from_hex(&spender_hex_key).map_err(to_napi_err)?;
        let transaction = self
            .transaction
            .post_miners_fee_unchecked(&spender_key)
            .map_err(to_napi_err)?;

        let mut vec: Vec<u8> = vec![];
        transaction.write(&mut vec).map_err(to_napi_err)?;
        Ok(Buffer::from(vec))
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
    #[napi]
    pub fn post(
        &mut self,
        spender_hex_key: String,
        change_goes_to: Option<String>,
        intended_transaction_fee: BigInt,
    ) -> Result<Buffer> {
        let spender_key = SaplingKey::from_hex(&spender_hex_key).map_err(to_napi_err)?;

        let intended_transaction_fee_u64 = intended_transaction_fee.get_u64().1;

        let change_key = match change_goes_to {
            Some(address) => Some(PublicAddress::from_hex(&address).map_err(to_napi_err)?),
            None => None,
        };

        let posted_transaction = self
            .transaction
            .post(&spender_key, change_key, intended_transaction_fee_u64)
            .map_err(to_napi_err)?;

        let mut vec: Vec<u8> = vec![];
        posted_transaction.write(&mut vec).map_err(to_napi_err)?;

        Ok(Buffer::from(vec))
    }

    // Outputs buffer of an unsigned transaction
    #[napi]
    pub fn build(
        &mut self,
        proof_authorizing_key_str: String,
        view_key_str: String,
        outgoing_view_key_str: String,
        intended_transaction_fee: BigInt,
        change_goes_to: Option<String>,
    ) -> Result<Buffer> {
        let view_key = ViewKey::from_hex(&view_key_str).map_err(to_napi_err)?;
        let outgoing_view_key =
            OutgoingViewKey::from_hex(&outgoing_view_key_str).map_err(to_napi_err)?;
        let proof_authorizing_key = ironfish_jubjub::Fr::from_hex(&proof_authorizing_key_str)
            .map_err(|_| to_napi_err("PublicKeyPackage authorizing key hex to bytes failed"))?;

        let change_address = match change_goes_to {
            Some(address) => Some(PublicAddress::from_hex(&address).map_err(to_napi_err)?),
            None => None,
        };
        let unsigned_transaction = self
            .transaction
            .build(
                proof_authorizing_key,
                view_key,
                outgoing_view_key,
                intended_transaction_fee.get_i64().0,
                change_address,
            )
            .map_err(to_napi_err)?;

        let mut vec: Vec<u8> = vec![];
        unsigned_transaction.write(&mut vec).map_err(to_napi_err)?;

        Ok(Buffer::from(vec))
    }

    #[napi]
    pub fn set_expiration(&mut self, sequence: u32) -> Undefined {
        self.transaction.set_expiration(sequence);
    }
}

#[napi]
pub fn verify_transactions(serialized_transactions: Vec<JsBuffer>) -> Result<bool> {
    let mut transactions: Vec<Transaction> = vec![];

    for tx_bytes in serialized_transactions {
        let buf = tx_bytes.into_value()?;
        match Transaction::read(buf.as_ref()) {
            Ok(tx) => transactions.push(tx),
            Err(_) => return Ok(false),
        }
    }

    Ok(batch_verify_transactions(transactions.iter()).is_ok())
}

#[napi(js_name = "UnsignedTransaction")]
pub struct NativeUnsignedTransaction {
    pub(crate) transaction: UnsignedTransaction,
}

#[napi]
impl NativeUnsignedTransaction {
    #[napi(constructor)]
    pub fn new(js_bytes: JsBuffer) -> Result<NativeUnsignedTransaction> {
        let bytes = js_bytes.into_value()?;

        let transaction = UnsignedTransaction::read(bytes.as_ref()).map_err(to_napi_err)?;

        Ok(NativeUnsignedTransaction { transaction })
    }

    #[napi]
    pub fn serialize(&self) -> Result<Buffer> {
        let mut vec: Vec<u8> = vec![];
        self.transaction.write(&mut vec).map_err(to_napi_err)?;

        Ok(Buffer::from(vec))
    }

    #[napi]
    pub fn randomized_public_key(&self) -> String {
        let bytes = self.transaction.randomized_public_key_bytes();
        bytes_to_hex(&bytes)
    }

    #[napi]
    pub fn public_key_randomness(&self) -> String {
        let bytes = self.transaction.public_key_randomness().to_bytes();
        bytes_to_hex(&bytes)
    }

    #[napi]
    pub fn hash(&self) -> Result<Buffer> {
        let hash = self
            .transaction
            .transaction_signature_hash()
            .map_err(to_napi_err)?;

        Ok(Buffer::from(hash.as_ref()))
    }

    #[napi]
    pub fn signing_package(&self, native_identifer_commitments: Vec<String>) -> Result<String> {
        let mut commitments = Vec::new();

        for identifier_commitment in native_identifer_commitments {
            let bytes = hex_to_vec_bytes(&identifier_commitment).map_err(to_napi_err)?;
            let signing_commitment =
                SigningCommitment::deserialize_from(&bytes[..]).map_err(to_napi_err)?;

            let commitment = SigningCommitments::new(
                *signing_commitment.hiding(),
                *signing_commitment.binding(),
            );

            commitments.push((signing_commitment.identity().clone(), commitment));
        }

        let signing_package = self
            .transaction
            .signing_package(commitments)
            .map_err(to_napi_err)?;

        let mut vec: Vec<u8> = vec![];
        signing_package.write(&mut vec).map_err(to_napi_err)?;

        Ok(bytes_to_hex(&vec))
    }

    #[napi]
    pub fn sign(&mut self, spender_hex_key: String) -> Result<Buffer> {
        let spender_key = SaplingKey::from_hex(&spender_hex_key).map_err(to_napi_err)?;

        let posted_transaction = self.transaction.sign(&spender_key).map_err(to_napi_err)?;

        let mut vec: Vec<u8> = vec![];
        posted_transaction.write(&mut vec).map_err(to_napi_err)?;

        Ok(Buffer::from(vec))
    }

    #[napi]
    pub fn add_signature(&mut self, signature: JsBuffer) -> Result<Buffer> {
        let bytes = signature.into_value()?;

        let mut signature_bytes = [0u8; 64];

        signature_bytes.copy_from_slice(bytes.as_ref());

        let signed_transaction = self
            .transaction
            .add_signature(signature_bytes)
            .map_err(to_napi_err)?;

        let mut vec: Vec<u8> = vec![];
        signed_transaction.write(&mut vec).map_err(to_napi_err)?;

        Ok(Buffer::from(vec))
    }
}

#[napi(namespace = "multisig")]
pub fn aggregate_signature_shares(
    public_key_package_str: String,
    signing_package_str: String,
    signature_shares_arr: Vec<String>,
) -> Result<Buffer> {
    let public_key_package = PublicKeyPackage::deserialize_from(
        &hex_to_vec_bytes(&public_key_package_str).map_err(to_napi_err)?[..],
    )
    .map_err(to_napi_err)?;

    let bytes = hex_to_vec_bytes(&signing_package_str).map_err(to_napi_err)?;
    let signing_package = SigningPackage::read(&bytes[..]).map_err(to_napi_err)?;

    let mut unsigned_transaction = signing_package.unsigned_transaction;

    let mut signature_shares = BTreeMap::<Identifier, FrostSignatureShare>::new();
    for signature_share in signature_shares_arr.iter() {
        let iss = SignatureShare::deserialize_from(
            &hex_to_vec_bytes(signature_share).map_err(to_napi_err)?[..],
        )
        .map_err(to_napi_err)?;
        signature_shares.insert(
            iss.identity().to_frost_identifier(),
            *iss.frost_signature_share(),
        );
    }

    let signed_transaction = unsigned_transaction
        .aggregate_signature_shares(
            &public_key_package,
            &signing_package.frost_signing_package,
            signature_shares,
        )
        .map_err(to_napi_err)?;

    let mut vec: Vec<u8> = vec![];
    signed_transaction.write(&mut vec).map_err(to_napi_err)?;

    Ok(Buffer::from(vec))
}
