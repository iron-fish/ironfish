/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish_rust::transaction::miners_fee::MinersFeeTransaction;
use ironfish_rust::transaction::transfer::Transaction;
use ironfish_rust::SaplingKey;
use napi::bindgen_prelude::*;
use napi_derive::napi;

use ironfish_rust::sapling_bls12::SAPLING;

use super::note::NativeNote;

#[napi(js_name = "MinersFeeTransaction")]
pub struct NapiMinersFeeTransaction {
    transaction: MinersFeeTransaction,
}

#[napi]
impl NapiMinersFeeTransaction {
    #[napi(constructor)]
    pub fn new(spender_hex_key: String, note: &NativeNote) -> Result<NapiMinersFeeTransaction> {
        let spender_key = SaplingKey::from_hex(&spender_hex_key)
            .map_err(|err| Error::from_reason(err.to_string()))?;
        let transaction = MinersFeeTransaction::build(SAPLING.clone(), spender_key, note.note)
            .map_err(|err| Error::from_reason(err.to_string()))?;
        Ok(NapiMinersFeeTransaction { transaction })
    }

    #[napi]
    pub fn serialize(&self) -> Result<Buffer> {
        let mut vec: Vec<u8> = vec![];
        self.transaction
            .write(&mut vec)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        Ok(Buffer::from(vec))
    }

    #[napi(factory)]
    pub fn deserialize(bytes: Buffer) -> Result<Self> {
        let transaction = MinersFeeTransaction::read(SAPLING.clone(), bytes.as_ref())
            .map_err(|err| Error::from_reason(err.to_string()))?;
        Ok(NapiMinersFeeTransaction { transaction })
    }

    #[napi]
    pub fn verify(&self) -> bool {
        match self.transaction.verify() {
            Ok(_) => true,
            Err(_e) => false,
        }
    }

    #[napi]
    pub fn fee(&self) -> i64n {
        i64n(self.transaction.fee)
    }

    #[napi]
    pub fn signature(&self) -> Result<Buffer> {
        let mut serialized_signature = vec![];
        self.transaction
            .binding_signature
            .write(&mut serialized_signature)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        Ok(Buffer::from(serialized_signature))
    }

    #[napi]
    pub fn hash(&self) -> Buffer {
        Buffer::from(self.transaction.signature_hash().as_ref())
    }

    #[napi]
    pub fn get_note(&self) -> Result<Buffer> {
        // Note bytes are 307 (should match `ENCRYPTED_NOTE_LENGTH` in JS)
        let mut vec: Vec<u8> = Vec::with_capacity(307);
        self.transaction
            .output
            .merkle_note()
            .write(&mut vec)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        Ok(Buffer::from(vec))
    }
}
