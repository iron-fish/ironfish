/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::cell::RefCell;
use std::convert::TryInto;

use ironfish_rust::transaction::batch_verify_transactions;
use ironfish_rust::{MerkleNoteHash, ProposedTransaction, PublicAddress, SaplingKey, Transaction};
use napi::{bindgen_prelude::*, JsBuffer};
use napi_derive::napi;

use crate::to_napi_err;

use super::note::NativeNote;
use super::spend_proof::NativeSpendDescription;
use super::witness::JsWitness;
use super::ENCRYPTED_NOTE_LENGTH;

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

#[napi]
impl NativeTransaction {
    #[napi(constructor)]
    pub fn new(spender_hex_key: String) -> Result<NativeTransaction> {
        let spender_key = SaplingKey::from_hex(&spender_hex_key).map_err(to_napi_err)?;
        Ok(NativeTransaction {
            transaction: ProposedTransaction::new(spender_key),
        })
    }

    /// Create a proof of a new note owned by the recipient in this transaction.
    #[napi]
    pub fn receive(&mut self, note: &NativeNote) {
        self.transaction.add_output(note.note.clone());
    }

    /// Spend the note owned by spender_hex_key at the given witness location.
    #[napi]
    pub fn spend(&mut self, env: Env, note: &NativeNote, witness: Object) {
        let w = JsWitness {
            cx: RefCell::new(env),
            obj: witness,
        };

        self.transaction.add_spend(note.note.clone(), &w);
    }

    /// Special case for posting a miners fee transaction. Miner fee transactions
    /// are unique in that they generate currency. They do not have any spends
    /// or change and therefore have a negative transaction fee. In normal use,
    /// a miner would not accept such a transaction unless it was explicitly set
    /// as the miners fee.
    #[napi(js_name = "post_miners_fee")]
    pub fn post_miners_fee(&mut self) -> Result<Buffer> {
        let transaction = self.transaction.post_miners_fee().map_err(to_napi_err)?;

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
        change_goes_to: Option<String>,
        intended_transaction_fee: BigInt,
    ) -> Result<Buffer> {
        let intended_transaction_fee_u64 = intended_transaction_fee.get_u64().1;

        let change_key = match change_goes_to {
            Some(address) => Some(PublicAddress::from_hex(&address).map_err(to_napi_err)?),
            None => None,
        };

        let posted_transaction = self
            .transaction
            .post(change_key, intended_transaction_fee_u64)
            .map_err(to_napi_err)?;

        let mut vec: Vec<u8> = vec![];
        posted_transaction.write(&mut vec).map_err(to_napi_err)?;

        Ok(Buffer::from(vec))
    }

    #[napi]
    pub fn set_expiration_sequence(&mut self, expiration_sequence: u32) -> Undefined {
        self.transaction
            .set_expiration_sequence(expiration_sequence);
    }
}

#[napi]
pub fn verify_transactions(serialized_transactions: Vec<Buffer>) -> bool {
    let mut transactions: Vec<Transaction> = vec![];

    for tx_bytes in serialized_transactions {
        match Transaction::read(&mut tx_bytes.as_ref()) {
            Ok(tx) => transactions.push(tx),
            Err(_) => return false,
        }
    }

    batch_verify_transactions(transactions.iter()).is_ok()
}
