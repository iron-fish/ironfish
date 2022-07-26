/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::cell::RefCell;
use std::convert::TryInto;

use ironfish_rust::transaction::batch_verify_transactions;
use ironfish_rust::{MerkleNoteHash, ProposedTransaction, PublicAddress, SaplingKey, Transaction};
use napi::bindgen_prelude::*;
use napi_derive::napi;

use ironfish_rust::sapling_bls12::SAPLING;

use super::note::NativeNote;
use super::spend_proof::NativeSpendProof;
use super::witness::JsWitness;

#[napi(js_name = "TransactionPosted")]
pub struct NativeTransactionPosted {
    transaction: Transaction,
}

#[napi]
impl NativeTransactionPosted {
    #[napi(constructor)]
    pub fn new(bytes: Buffer) -> Result<NativeTransactionPosted> {
        let mut cursor = std::io::Cursor::new(bytes);

        let transaction = Transaction::read(SAPLING.clone(), &mut cursor)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        Ok(NativeTransactionPosted { transaction })
    }

    #[napi]
    pub fn serialize(&self) -> Result<Buffer> {
        let mut vec: Vec<u8> = vec![];
        self.transaction
            .write(&mut vec)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        Ok(Buffer::from(vec))
    }

    #[napi]
    pub fn verify(&self) -> bool {
        match self.transaction.verify() {
            Ok(_) => true,
            Err(_e) => false,
        }
    }

    #[napi]
    pub fn notes_length(&self) -> Result<i64> {
        let notes_len: i64 = self
            .transaction
            .receipts()
            .len()
            .try_into()
            .map_err(|_| Error::from_reason("Value out of range".to_string()))?;

        Ok(notes_len)
    }

    #[napi]
    pub fn get_note(&self, index: i64) -> Result<Buffer> {
        let index_usize: usize = index
            .try_into()
            .map_err(|_| Error::from_reason("Value out of range".to_string()))?;

        let proof = &self.transaction.receipts()[index_usize];
        // Note bytes are 275
        let mut vec: Vec<u8> = Vec::with_capacity(275);
        proof
            .merkle_note()
            .write(&mut vec)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        Ok(Buffer::from(vec))
    }

    #[napi]
    pub fn spends_length(&self) -> Result<i64> {
        let spends_len: i64 = self
            .transaction
            .spends()
            .len()
            .try_into()
            .map_err(|_| Error::from_reason("Value out of range".to_string()))?;

        Ok(spends_len)
    }

    #[napi]
    pub fn get_spend(&self, index: i64) -> Result<NativeSpendProof> {
        let index_usize: usize = index
            .try_into()
            .map_err(|_| Error::from_reason("Value out of range".to_string()))?;

        let proof = &self.transaction.spends()[index_usize];

        let mut root_hash: Vec<u8> = vec![];

        MerkleNoteHash::new(proof.root_hash())
            .write(&mut root_hash)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        let nullifier = Buffer::from(proof.nullifier().to_vec());

        Ok(NativeSpendProof {
            tree_size: proof.tree_size(),
            root_hash: Buffer::from(root_hash),
            nullifier,
        })
    }

    #[napi]
    pub fn fee(&self) -> i64n {
        i64n(self.transaction.transaction_fee())
    }

    #[napi]
    pub fn transaction_signature(&self) -> Result<Buffer> {
        let mut serialized_signature = vec![];
        self.transaction
            .binding_signature()
            .write(&mut serialized_signature)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        Ok(Buffer::from(serialized_signature))
    }

    #[napi]
    pub fn hash(&self) -> Buffer {
        let hash = self.transaction.transaction_signature_hash();

        Buffer::from(hash.as_ref())
    }

    #[napi]
    pub fn expiration_sequence(&self) -> u32 {
        self.transaction.expiration_sequence()
    }
}

#[napi(js_name = "Transaction")]
pub struct NativeTransaction {
    transaction: ProposedTransaction,
}

impl Default for NativeTransaction {
    fn default() -> Self {
        Self::new()
    }
}

#[napi]
impl NativeTransaction {
    #[napi(constructor)]
    pub fn new() -> NativeTransaction {
        NativeTransaction {
            transaction: ProposedTransaction::new(SAPLING.clone()),
        }
    }

    /// Create a proof of a new note owned by the recipient in this transaction.
    #[napi]
    pub fn receive(&mut self, spender_hex_key: String, note: &NativeNote) -> Result<String> {
        let spender_key = SaplingKey::from_hex(&spender_hex_key)
            .map_err(|err| Error::from_reason(err.to_string()))?;
        self.transaction
            .receive(&spender_key, &note.note)
            .map_err(|err| Error::from_reason(err.to_string()))?;
        Ok("".to_string())
    }

    /// Spend the note owned by spender_hex_key at the given witness location.
    #[napi]
    pub fn spend(
        &mut self,
        env: Env,
        spender_hex_key: String,
        note: &NativeNote,
        witness: Object,
    ) -> Result<String> {
        let w = JsWitness {
            cx: RefCell::new(env),
            obj: witness,
        };

        let spender_key = SaplingKey::from_hex(&spender_hex_key)
            .map_err(|err| Error::from_reason(err.to_string()))?;
        self.transaction
            .spend(spender_key, &note.note, &w)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        Ok("".to_string())
    }

    /// Special case for posting a miners fee transaction. Miner fee transactions
    /// are unique in that they generate currency. They do not have any spends
    /// or change and therefore have a negative transaction fee. In normal use,
    /// a miner would not accept such a transaction unless it was explicitly set
    /// as the miners fee.
    #[napi(js_name = "post_miners_fee")]
    pub fn post_miners_fee(&mut self) -> Result<Buffer> {
        let transaction = self
            .transaction
            .post_miners_fee()
            .map_err(|err| Error::from_reason(err.to_string()))?;

        let mut vec: Vec<u8> = vec![];
        transaction
            .write(&mut vec)
            .map_err(|err| Error::from_reason(err.to_string()))?;
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
    /// aka: self.transaction_fee - intended_transaction_fee - change = 0
    #[napi]
    pub fn post(
        &mut self,
        spender_hex_key: String,
        change_goes_to: Option<String>,
        intended_transaction_fee: BigInt,
    ) -> Result<Buffer> {
        let intended_transaction_fee_u64 = intended_transaction_fee.get_u64().1;

        let spender_key = SaplingKey::from_hex(&spender_hex_key)
            .map_err(|err| Error::from_reason(err.to_string()))?;
        let change_key = match change_goes_to {
            Some(address) => Some(
                PublicAddress::from_hex(&address)
                    .map_err(|err| Error::from_reason(err.to_string()))?,
            ),
            None => None,
        };

        let posted_transaction = self
            .transaction
            .post(&spender_key, change_key, intended_transaction_fee_u64)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        let mut vec: Vec<u8> = vec![];
        posted_transaction
            .write(&mut vec)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        Ok(Buffer::from(vec))
    }

    #[napi]
    pub fn set_expiration_sequence(&mut self, expiration_sequence: u32) -> Undefined {
        self.transaction
            .set_expiration_sequence(expiration_sequence);
    }
}

#[napi]
pub fn verify_transactions(raw_transactions: Vec<Buffer>) -> bool {
    let mut transactions: Vec<Transaction> = vec![];

    for tx_bytes in raw_transactions {
        let mut cursor = std::io::Cursor::new(tx_bytes);

        match Transaction::read(SAPLING.clone(), &mut cursor) {
            Ok(tx) => transactions.push(tx),
            Err(_) => return false,
        }
    }

    batch_verify_transactions(SAPLING.clone(), transactions).is_ok()
}
