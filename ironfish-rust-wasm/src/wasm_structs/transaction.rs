/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use wasm_bindgen::prelude::*;

use ironfish_rust::sapling_bls12::{Key, ProposedTransaction, PublicAddress, Transaction, SAPLING};

use super::errors::*;
use super::note::WasmNote;
use super::panic_hook;
use super::spend_proof::WasmSpendProof;
use super::witness::JsWitness;

#[wasm_bindgen]
pub struct WasmTransactionPosted {
    transaction: Transaction,
}

#[wasm_bindgen]
impl WasmTransactionPosted {
    #[wasm_bindgen]
    pub fn deserialize(bytes: &[u8]) -> Result<WasmTransactionPosted, JsValue> {
        panic_hook::set_once();

        let mut cursor: std::io::Cursor<&[u8]> = std::io::Cursor::new(bytes);
        let transaction =
            Transaction::read(SAPLING.clone(), &mut cursor).map_err(WasmTransactionError)?;
        Ok(WasmTransactionPosted { transaction })
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Result<Vec<u8>, JsValue> {
        let mut cursor: std::io::Cursor<Vec<u8>> = std::io::Cursor::new(vec![]);
        self.transaction.write(&mut cursor).map_err(WasmIoError)?;
        Ok(cursor.into_inner())
    }

    #[wasm_bindgen]
    pub fn verify(&self) -> bool {
        match self.transaction.verify() {
            Ok(_) => true,
            Err(_e) => false,
        }
    }

    #[wasm_bindgen(getter, js_name = "notesLength")]
    pub fn notes_length(&self) -> usize {
        self.transaction.receipts().len()
    }

    #[wasm_bindgen(js_name = "getNote")]
    pub fn get_note(&self, index: usize) -> Result<Vec<u8>, JsValue> {
        let proof = &self.transaction.receipts()[index];
        // Note bytes are 275
        let mut cursor: Vec<u8> = Vec::with_capacity(275);
        proof
            .merkle_note()
            .write(&mut cursor)
            .map_err(WasmIoError)?;
        Ok(cursor)
    }

    #[wasm_bindgen(getter, js_name = "spendsLength")]
    pub fn spends_length(&self) -> usize {
        self.transaction.spends().len()
    }

    #[wasm_bindgen(js_name = "getSpend")]
    pub fn get_spend(&self, index: usize) -> WasmSpendProof {
        let proof = &self.transaction.spends()[index];
        WasmSpendProof {
            proof: proof.clone(),
        }
    }

    #[wasm_bindgen(getter, js_name = "fee")]
    pub fn fee(&self) -> i64 {
        self.transaction.transaction_fee()
    }

    #[wasm_bindgen(getter, js_name = "transactionSignature")]
    pub fn transaction_signature(&self) -> Result<Vec<u8>, JsValue> {
        let mut serialized_signature = vec![];
        self.transaction
            .binding_signature()
            .write(&mut serialized_signature)
            .map_err(WasmIoError)?;
        Ok(serialized_signature)
    }

    #[wasm_bindgen(getter, js_name = "hash")]
    pub fn hash(&self) -> Vec<u8> {
        self.transaction.transaction_signature_hash().to_vec()
    }

    #[wasm_bindgen(getter, js_name = "expirationSequence")]
    pub fn expiration_sequence(&self) -> u32 {
        self.transaction.expiration_sequence()
    }
}

#[wasm_bindgen]
pub struct WasmTransaction {
    transaction: ProposedTransaction,
}

#[wasm_bindgen]
impl WasmTransaction {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmTransaction {
        panic_hook::set_once();

        WasmTransaction {
            transaction: ProposedTransaction::new(SAPLING.clone()),
        }
    }

    /// Create a proof of a new note owned by the recipient in this transaction.
    #[wasm_bindgen]
    pub fn receive(&mut self, spender_hex_key: &str, note: &WasmNote) -> Result<String, JsValue> {
        let spender_key =
            Key::from_hex(SAPLING.clone(), spender_hex_key).map_err(WasmSaplingKeyError)?;
        self.transaction
            .receive(&spender_key, &note.note)
            .map_err(WasmSaplingProofError)?;
        Ok("".to_string())
    }

    /// Spend the note owned by spender_hex_key at the given witness location.
    #[wasm_bindgen]
    pub fn spend(
        &mut self,
        spender_hex_key: &str,
        note: &WasmNote,
        witness: &JsWitness,
    ) -> Result<String, JsValue> {
        let spender_key =
            Key::from_hex(SAPLING.clone(), spender_hex_key).map_err(WasmSaplingKeyError)?;
        self.transaction
            .spend(spender_key, &note.note, witness)
            .map_err(WasmSaplingProofError)?;
        Ok("".to_string())
    }

    /// Special case for posting a miners fee transaction. Miner fee transactions
    /// are unique in that they generate currency. They do not have any spends
    /// or change and therefore have a negative transaction fee. In normal use,
    /// a miner would not accept such a transaction unless it was explicitly set
    /// as the miners fee.
    #[wasm_bindgen]
    pub fn post_miners_fee(&mut self) -> Result<WasmTransactionPosted, JsValue> {
        let transaction = self
            .transaction
            .post_miners_fee()
            .map_err(WasmTransactionError)?;
        Ok(WasmTransactionPosted { transaction })
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
    #[wasm_bindgen]
    pub fn post(
        &mut self,
        spender_hex_key: &str,
        change_goes_to: Option<String>,
        intended_transaction_fee: u64,
    ) -> Result<WasmTransactionPosted, JsValue> {
        let spender_key =
            Key::from_hex(SAPLING.clone(), spender_hex_key).map_err(WasmSaplingKeyError)?;
        let change_key = match change_goes_to {
            Some(s) => {
                Some(PublicAddress::from_hex(SAPLING.clone(), &s).map_err(WasmSaplingKeyError)?)
            }
            None => None,
        };

        let posted_transaction = self
            .transaction
            .post(&spender_key, change_key, intended_transaction_fee)
            .map_err(WasmTransactionError)?;

        Ok(WasmTransactionPosted {
            transaction: posted_transaction,
        })
    }

    #[wasm_bindgen(js_name = "setExpirationSequence")]
    pub fn set_expiration_sequence(&mut self, expiration_sequence: u32) {
        self.transaction
            .set_expiration_sequence(expiration_sequence);
    }
}

impl Default for WasmTransaction {
    fn default() -> Self {
        WasmTransaction::new()
    }
}
