/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use napi::{bindgen_prelude::*, JsBuffer};
use napi_derive::napi;

use ironfish_rust::{Note, SaplingKey};

use crate::to_napi_err;

#[napi]
pub const DECRYPTED_NOTE_LENGTH: u32 = 115;

#[napi(js_name = "Note")]
pub struct NativeNote {
    pub(crate) note: Note,
}

#[napi]
impl NativeNote {
    #[napi(constructor)]
    pub fn new(owner: String, value: BigInt, memo: String) -> Result<Self> {
        let value_u64 = value.get_u64().1;

        let owner_address = ironfish_rust::PublicAddress::from_hex(&owner).map_err(to_napi_err)?;
        Ok(NativeNote {
            note: Note::new(owner_address, value_u64, memo),
        })
    }

    #[napi(factory)]
    pub fn deserialize(js_bytes: JsBuffer) -> Result<Self> {
        let byte_vec = js_bytes.into_value()?;

        let note = Note::read(byte_vec.as_ref()).map_err(to_napi_err)?;

        Ok(NativeNote { note })
    }

    #[napi]
    pub fn serialize(&self) -> Result<Buffer> {
        let mut arr: Vec<u8> = vec![];
        self.note.write(&mut arr).map_err(to_napi_err)?;

        Ok(Buffer::from(arr))
    }

    /// Value this note represents.
    #[napi]
    pub fn value(&self) -> u64 {
        self.note.value()
    }

    /// Arbitrary note the spender can supply when constructing a spend so the
    /// receiver has some record from whence it came.
    /// Note: While this is encrypted with the output, it is not encoded into
    /// the proof in any way.
    #[napi]
    pub fn memo(&self) -> String {
        self.note.memo().to_string()
    }

    /// Compute the nullifier for this note, given the private key of its owner.
    ///
    /// The nullifier is a series of bytes that is published by the note owner
    /// only at the time the note is spent. This key is collected in a massive
    /// 'nullifier set', preventing double-spend.
    #[napi]
    pub fn nullifier(&self, owner_private_key: String, position: BigInt) -> Result<Buffer> {
        let position_u64 = position.get_u64().1;

        let private_key = SaplingKey::from_hex(&owner_private_key).map_err(to_napi_err)?;

        let nullifier: &[u8] = &self.note.nullifier(&private_key, position_u64).0;

        Ok(Buffer::from(nullifier))
    }
}
