/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::cell::RefCell;
use std::convert::TryInto;

use neon::prelude::*;

use ironfish_rust::sapling_bls12::{
    Key, ProposedTransaction, PublicAddress, SimpleTransaction, Transaction, SAPLING,
};

use super::note::NativeNote;
use super::spend_proof::NativeSpendProof;
use super::witness::JsWitness;

pub struct NativeTransactionPosted {
    transaction: Transaction,
}

impl Finalize for NativeTransactionPosted {}

impl NativeTransactionPosted {
    pub fn deserialize(mut cx: FunctionContext) -> JsResult<JsBox<NativeTransactionPosted>> {
        let bytes = cx.argument::<JsBuffer>(0)?;

        let transaction = cx
            .borrow(&bytes, |data| {
                let mut cursor: std::io::Cursor<&[u8]> = std::io::Cursor::new(data.as_slice());
                Transaction::read(SAPLING.clone(), &mut cursor)
            })
            .or_else(|err| cx.throw_error(err.to_string()))?;

        Ok(cx.boxed(NativeTransactionPosted { transaction }))
    }

    pub fn serialize(mut cx: FunctionContext) -> JsResult<JsBuffer> {
        let transaction = cx
            .this()
            .downcast_or_throw::<JsBox<NativeTransactionPosted>, _>(&mut cx)?;

        let mut arr: Vec<u8> = vec![];
        transaction
            .transaction
            .write(&mut arr)
            .or_else(|err| cx.throw_error(err.to_string()))?;

        let mut bytes = cx.buffer(arr.len().try_into().unwrap())?;

        cx.borrow_mut(&mut bytes, |data| {
            let slice = data.as_mut_slice();
            slice.clone_from_slice(&arr[..slice.len()]);
        });

        Ok(bytes)
    }

    pub fn verify(mut cx: FunctionContext) -> JsResult<JsBoolean> {
        let transaction = cx
            .this()
            .downcast_or_throw::<JsBox<NativeTransactionPosted>, _>(&mut cx)?;

        Ok(match transaction.transaction.verify() {
            Ok(_) => cx.boolean(true),
            Err(_e) => cx.boolean(false),
        })
    }

    pub fn notes_length(mut cx: FunctionContext) -> JsResult<JsNumber> {
        let transaction = cx
            .this()
            .downcast_or_throw::<JsBox<NativeTransactionPosted>, _>(&mut cx)?;

        Ok(cx.number(transaction.transaction.receipts().len() as f64))
    }

    pub fn get_note(mut cx: FunctionContext) -> JsResult<JsBuffer> {
        let transaction = cx
            .this()
            .downcast_or_throw::<JsBox<NativeTransactionPosted>, _>(&mut cx)?;
        let index = cx.argument::<JsNumber>(0)?.value(&mut cx) as usize;

        let proof = &transaction.transaction.receipts()[index];
        // Note bytes are 275
        let mut arr: Vec<u8> = Vec::with_capacity(275);
        proof
            .merkle_note()
            .write(&mut arr)
            .or_else(|err| cx.throw_error(err.to_string()))?;

        let mut bytes = cx.buffer(arr.len() as u32)?;

        cx.borrow_mut(&mut bytes, |data| {
            let slice = data.as_mut_slice();
            slice.clone_from_slice(&arr[..slice.len()]);
        });

        Ok(bytes)
    }

    pub fn spends_length(mut cx: FunctionContext) -> JsResult<JsNumber> {
        let transaction = cx
            .this()
            .downcast_or_throw::<JsBox<NativeTransactionPosted>, _>(&mut cx)?;

        Ok(cx.number(transaction.transaction.spends().len() as f64))
    }

    pub fn get_spend(mut cx: FunctionContext) -> JsResult<JsBox<NativeSpendProof>> {
        let transaction = cx
            .this()
            .downcast_or_throw::<JsBox<NativeTransactionPosted>, _>(&mut cx)?;
        let index = cx.argument::<JsNumber>(0)?.value(&mut cx) as usize;

        let proof = &transaction.transaction.spends()[index];
        Ok(cx.boxed(NativeSpendProof {
            proof: proof.clone(),
        }))
    }

    pub fn fee(mut cx: FunctionContext) -> JsResult<JsString> {
        let transaction = cx
            .this()
            .downcast_or_throw::<JsBox<NativeTransactionPosted>, _>(&mut cx)?;

        // TODO: Should be BigInt, but no first-class Neon support
        Ok(cx.string(transaction.transaction.transaction_fee().to_string()))
    }

    pub fn transaction_signature(mut cx: FunctionContext) -> JsResult<JsBuffer> {
        let transaction = cx
            .this()
            .downcast_or_throw::<JsBox<NativeTransactionPosted>, _>(&mut cx)?;

        let mut serialized_signature = vec![];
        transaction
            .transaction
            .binding_signature()
            .write(&mut serialized_signature)
            .or_else(|err| cx.throw_error(err.to_string()))?;

        let mut bytes = cx.buffer(serialized_signature.len() as u32)?;

        cx.borrow_mut(&mut bytes, |data| {
            let slice = data.as_mut_slice();
            slice.clone_from_slice(&serialized_signature[..slice.len()]);
        });

        Ok(bytes)
    }

    pub fn hash(mut cx: FunctionContext) -> JsResult<JsBuffer> {
        let transaction = cx
            .this()
            .downcast_or_throw::<JsBox<NativeTransactionPosted>, _>(&mut cx)?;

        let hash = transaction.transaction.transaction_signature_hash();

        let mut bytes = cx.buffer(hash.len() as u32)?;

        cx.borrow_mut(&mut bytes, |data| {
            let slice = data.as_mut_slice();
            slice.clone_from_slice(&hash[..slice.len()]);
        });

        Ok(bytes)
    }

    pub fn expiration_sequence(mut cx: FunctionContext) -> JsResult<JsNumber> {
        let transaction = cx
            .this()
            .downcast_or_throw::<JsBox<NativeTransactionPosted>, _>(&mut cx)?;
        Ok(cx.number(transaction.transaction.expiration_sequence()))
    }
}

type BoxedNativeTransaction = JsBox<RefCell<NativeTransaction>>;

pub struct NativeTransaction {
    transaction: ProposedTransaction,
}

impl Finalize for NativeTransaction {}

impl NativeTransaction {
    pub fn new(mut cx: FunctionContext) -> JsResult<BoxedNativeTransaction> {
        Ok(cx.boxed(RefCell::new(NativeTransaction {
            transaction: ProposedTransaction::new(SAPLING.clone()),
        })))
    }

    /// Create a proof of a new note owned by the recipient in this transaction.
    pub fn receive(mut cx: FunctionContext) -> JsResult<JsString> {
        let transaction = cx
            .this()
            .downcast_or_throw::<BoxedNativeTransaction, _>(&mut cx)?;
        let spender_hex_key = cx.argument::<JsString>(0)?.value(&mut cx);
        let note = cx.argument::<JsBox<NativeNote>>(1)?;

        let spender_key = Key::from_hex(SAPLING.clone(), &spender_hex_key)
            .or_else(|err| cx.throw_error(err.to_string()))?;
        transaction
            .borrow_mut()
            .transaction
            .receive(&spender_key, &note.note)
            .or_else(|err| cx.throw_error(err.to_string()))?;
        Ok(cx.string(""))
    }

    /// Spend the note owned by spender_hex_key at the given witness location.
    pub fn spend(mut cx: FunctionContext) -> JsResult<JsString> {
        let transaction = cx
            .this()
            .downcast_or_throw::<BoxedNativeTransaction, _>(&mut cx)?;
        let spender_hex_key = cx.argument::<JsString>(0)?.value(&mut cx);
        let note = cx.argument::<JsBox<NativeNote>>(1)?;
        // JsBox<JsWitness>
        let witness = cx.argument::<JsObject>(2)?;

        let ret = cx.string("");

        let w = JsWitness {
            cx: RefCell::new(cx),
            obj: witness,
        };

        let spender_key = Key::from_hex(SAPLING.clone(), &spender_hex_key)
            .or_else(|err| w.cx.borrow_mut().throw_error(err.to_string()))?;
        transaction
            .borrow_mut()
            .transaction
            .spend(spender_key, &note.note, &w)
            .or_else(|err| w.cx.borrow_mut().throw_error(err.to_string()))?;

        Ok(ret)
    }

    /// Special case for posting a miners fee transaction. Miner fee transactions
    /// are unique in that they generate currency. They do not have any spends
    /// or change and therefore have a negative transaction fee. In normal use,
    /// a miner would not accept such a transaction unless it was explicitly set
    /// as the miners fee.
    pub fn post_miners_fee(mut cx: FunctionContext) -> JsResult<JsBox<NativeTransactionPosted>> {
        let transaction = cx
            .this()
            .downcast_or_throw::<BoxedNativeTransaction, _>(&mut cx)?;

        let transaction = transaction
            .borrow_mut()
            .transaction
            .post_miners_fee()
            .or_else(|err| cx.throw_error(err.to_string()))?;
        Ok(cx.boxed(NativeTransactionPosted { transaction }))
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
