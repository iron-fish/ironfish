/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::cell::RefCell;
use std::convert::TryInto;

use napi::bindgen_prelude::*;
use napi_derive::napi;

use neon::prelude::*;

use ironfish_rust::sapling_bls12::{
    Key, ProposedTransaction, PublicAddress, SimpleTransaction, Transaction, SAPLING,
};

use super::note::NativeNote;
use super::spend_proof::NativeSpendProof;
use super::witness::JsWitness;

#[napi]
pub struct NativeTransactionPosted {
    transaction: Transaction,
}

#[napi]
impl NativeTransactionPosted {
    #[napi(factory)]
    pub fn deserialize(bytes: Buffer) -> Result<NativeTransactionPosted> {
        let cursor = std::io::Cursor::new(bytes);

        let transaction = Transaction::read(SAPLING.clone(), &mut cursor).map_err(|err| Error::from_reason(err.to_string()))?;

        Ok(NativeTransactionPosted { transaction })
    }

    #[napi]
    pub fn serialize(&self) -> Result<Buffer> {
        let mut vec: Vec<u8> = vec![];
        self
            .transaction
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
        let notes_len: i64 = self.transaction.receipts().len().try_into().map_err(|_| Error::from_reason("Value out of range".to_string()))?;

        Ok(notes_len)
    }

    #[napi]
    pub fn get_note(&self, index: i64) -> Result<Buffer> {
        let index_usize: usize = index.try_into().map_err(|_| Error::from_reason("Value out of range".to_string()))?;

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
        let spends_len: i64 = self.transaction.spends().len().try_into().map_err(|_| Error::from_reason("Value out of range".to_string()))?;

        Ok(spends_len)
    }

    #[napi]
    pub fn get_spend(&self, index: i64) -> Result<NativeSpendProof> {
        let index_usize: usize = index.try_into().map_err(|_| Error::from_reason("Value out of range".to_string()))?;

        let proof = &self.transaction.spends()[index_usize];
        Ok(NativeSpendProof {
            proof: proof.clone(),
        })
    }

    #[napi]
    pub fn fee(&self) -> i64n {
        i64n(self.transaction.transaction_fee())
    }

    #[napi]
    pub fn transaction_signature(&self) -> Result<Buffer> {
        let mut serialized_signature = vec![];
        self
            .transaction
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

type BoxedNativeTransaction = JsBox<RefCell<NativeTransaction>>;

#[napi]
pub struct NativeTransaction {
    transaction: ProposedTransaction,
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
    pub fn receive(&self, spender_hex_key: String, note: &NativeNote) -> Result<String> {
        let spender_key = Key::from_hex(SAPLING.clone(), &spender_hex_key)
            .map_err(|err| Error::from_reason(err.to_string()))?;
        self
            .transaction
            .receive(&spender_key, &note.note)
            .map_err(|err| Error::from_reason(err.to_string()))?;
        Ok("".to_string())
    }

    /// Spend the note owned by spender_hex_key at the given witness location.
    #[napi]
    pub fn spend(&self, spender_hex_key: String, note: &NativeNote) -> Result<String> {
        // JsBox<JsWitness>
        let witness = cx.argument::<JsObject>(2)?;

        let w = JsWitness {
            cx: RefCell::new(cx),
            obj: witness,
        };

        let spender_key = Key::from_hex(SAPLING.clone(), &spender_hex_key)
            .map_err(|err| Error::from_reason(err.to_string()))?;
        self
            .transaction
            .spend(spender_key, &note.note, &w)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        Ok("".to_string())
    }

    /// Special case for posting a miners fee transaction. Miner fee transactions
    /// are unique in that they generate currency. They do not have any spends
    /// or change and therefore have a negative transaction fee. In normal use,
    /// a miner would not accept such a transaction unless it was explicitly set
    /// as the miners fee.
    #[napi]
    pub fn post_miners_fee(&self) -> Result<NativeTransactionPosted> {
        let transaction = self
            .transaction
            .post_miners_fee()
            .map_err(|err| Error::from_reason(err.to_string()))?;
        Ok(NativeTransactionPosted { transaction })
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
    pub fn post(mut cx: FunctionContext) -> JsResult<JsBox<NativeTransactionPosted>> {
        let transaction = cx
            .this()
            .downcast_or_throw::<BoxedNativeTransaction, _>(&mut cx)?;
        let spender_hex_key = cx.argument::<JsString>(0)?.value(&mut cx);
        let change_goes_to = cx.argument::<JsString>(1)?.value(&mut cx);
        // TODO: Should be BigInt, but no first-class Neon support
        let intended_transaction_fee = cx.argument::<JsString>(2)?.value(&mut cx);

        let intended_transaction_fee_u64 = intended_transaction_fee
            .parse::<u64>()
            .or_else(|err| cx.throw_error(err.to_string()))?;

        let spender_key = Key::from_hex(SAPLING.clone(), &spender_hex_key)
            .or_else(|err| cx.throw_error(err.to_string()))?;
        let change_key = if !change_goes_to.is_empty() {
            Some(
                PublicAddress::from_hex(SAPLING.clone(), &change_goes_to)
                    .or_else(|err| cx.throw_error(err.to_string()))?,
            )
        } else {
            None
        };

        let posted_transaction = transaction
            .borrow_mut()
            .transaction
            .post(&spender_key, change_key, intended_transaction_fee_u64)
            .or_else(|err| cx.throw_error(err.to_string()))?;

        Ok(cx.boxed(NativeTransactionPosted {
            transaction: posted_transaction,
        }))
    }

    pub fn set_expiration_sequence(mut cx: FunctionContext) -> JsResult<JsUndefined> {
        let transaction = cx
            .this()
            .downcast_or_throw::<BoxedNativeTransaction, _>(&mut cx)?;
        let expiration_sequence = cx.argument::<JsNumber>(0)?.value(&mut cx) as u32;
        transaction
            .borrow_mut()
            .transaction
            .set_expiration_sequence(expiration_sequence);

        Ok(cx.undefined())
    }
}

type BoxedNativeSimpleTransaction = JsBox<RefCell<NativeSimpleTransaction>>;

pub struct NativeSimpleTransaction {
    transaction: SimpleTransaction,
}

impl Finalize for NativeSimpleTransaction {}

impl NativeSimpleTransaction {
    pub fn new(mut cx: FunctionContext) -> JsResult<BoxedNativeSimpleTransaction> {
        let spender_hex_key = cx.argument::<JsString>(0)?.value(&mut cx);
        let intended_transaction_fee = cx.argument::<JsString>(1)?.value(&mut cx);
        let intended_transaction_fee_u64 = intended_transaction_fee
            .parse::<u64>()
            .or_else(|err| cx.throw_error(err.to_string()))?;

        let spender_key = Key::from_hex(SAPLING.clone(), &spender_hex_key)
            .or_else(|err| cx.throw_error(err.to_string()))?;
        Ok(cx.boxed(RefCell::new(NativeSimpleTransaction {
            transaction: SimpleTransaction::new(
                SAPLING.clone(),
                spender_key,
                intended_transaction_fee_u64,
            ),
        })))
    }

    pub fn spend(mut cx: FunctionContext) -> JsResult<JsString> {
        let transaction = cx
            .this()
            .downcast_or_throw::<BoxedNativeSimpleTransaction, _>(&mut cx)?;
        let note = cx.argument::<JsBox<NativeNote>>(0)?;
        let w = cx.argument::<JsObject>(1)?;

        let ret = cx.string("");

        let witness = JsWitness {
            cx: RefCell::new(cx),
            obj: w,
        };

        transaction
            .borrow_mut()
            .transaction
            .spend(&note.note, &witness)
            .or_else(|err| witness.cx.borrow_mut().throw_error(err.to_string()))?;

        Ok(ret)
    }

    pub fn receive(mut cx: FunctionContext) -> JsResult<JsString> {
        let transaction = cx
            .this()
            .downcast_or_throw::<BoxedNativeSimpleTransaction, _>(&mut cx)?;
        let note = cx.argument::<JsBox<NativeNote>>(0)?;

        transaction
            .borrow_mut()
            .transaction
            .receive(&note.note)
            .or_else(|err| cx.throw_error(err.to_string()))?;
        Ok(cx.string(""))
    }

    pub fn post(mut cx: FunctionContext) -> JsResult<JsBox<NativeTransactionPosted>> {
        let transaction = cx
            .this()
            .downcast_or_throw::<BoxedNativeSimpleTransaction, _>(&mut cx)?;

        let posted_transaction = transaction
            .borrow_mut()
            .transaction
            .post()
            .or_else(|err| cx.throw_error(err.to_string()))?;
        Ok(cx.boxed(NativeTransactionPosted {
            transaction: posted_transaction,
        }))
    }
}
