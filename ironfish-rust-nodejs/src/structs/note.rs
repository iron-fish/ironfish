/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::cmp;

use ironfish::{
    assets::asset::ID_LENGTH as ASSET_ID_LENGTH,
    keys::PUBLIC_ADDRESS_SIZE,
    note::{AMOUNT_VALUE_SIZE, MEMO_SIZE, SCALAR_SIZE},
    ViewKey,
};
use napi::{bindgen_prelude::*, JsBuffer};
use napi_derive::napi;

use ironfish::Note;

use crate::to_napi_err;

#[napi]
pub const PUBLIC_ADDRESS_LENGTH: u32 = PUBLIC_ADDRESS_SIZE as u32;

#[napi]
pub const RANDOMNESS_LENGTH: u32 = SCALAR_SIZE as u32;

#[napi]
pub const MEMO_LENGTH: u32 = MEMO_SIZE as u32;

#[napi]
pub const AMOUNT_VALUE_LENGTH: u32 = AMOUNT_VALUE_SIZE as u32;

#[napi]
pub const DECRYPTED_NOTE_LENGTH: u32 = RANDOMNESS_LENGTH
    + MEMO_LENGTH
    + ASSET_ID_LENGTH as u32
    + PUBLIC_ADDRESS_LENGTH
    + AMOUNT_VALUE_LENGTH
    + PUBLIC_ADDRESS_LENGTH;
//  32 randomness
//+ 32 memo
//+ 32 public address
//+ 32 asset id
//+ 8  value
//+ 32 sender address
//= 168 bytes

#[napi(js_name = "Note")]
pub struct NativeNote {
    pub(crate) note: Note,
}

#[napi]
impl NativeNote {
    #[napi(constructor)]
    pub fn new(
        owner: String,
        value: BigInt,
        memo: JsBuffer,
        asset_id: JsBuffer,
        sender: String,
    ) -> Result<Self> {
        let value_u64 = value.get_u64().1;
        let owner_address = ironfish::PublicAddress::from_hex(&owner).map_err(to_napi_err)?;
        let sender_address = ironfish::PublicAddress::from_hex(&sender).map_err(to_napi_err)?;

        let memo_buffer = memo.into_value()?;
        let memo_vec = memo_buffer.as_ref();
        let num_to_copy = cmp::min(memo_vec.len(), MEMO_SIZE);
        let mut memo_bytes = [0; MEMO_SIZE];
        memo_bytes[..num_to_copy].copy_from_slice(&memo_vec[..num_to_copy]);

        let buffer = asset_id.into_value()?;
        let asset_id_vec = buffer.as_ref();
        let mut asset_id_bytes = [0; ASSET_ID_LENGTH];
        asset_id_bytes.clone_from_slice(&asset_id_vec[0..ASSET_ID_LENGTH]);
        let asset_id = asset_id_bytes.try_into().map_err(to_napi_err)?;

        Ok(NativeNote {
            note: Note::new(
                owner_address,
                value_u64,
                memo_bytes,
                asset_id,
                sender_address,
            ),
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

    /// The commitment hash of the note
    /// This hash is what gets used for the leaf nodes in a Merkle Tree.
    #[napi]
    pub fn hash(&self) -> Buffer {
        Buffer::from(&self.note.commitment()[..])
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

    /// Asset identifier associated with this note
    #[napi]
    pub fn asset_id(&self) -> Buffer {
        Buffer::from(&self.note.asset_id().as_bytes()[..])
    }

    /// Sender of the note
    #[napi]
    pub fn sender(&self) -> String {
        self.note.sender().hex_public_address()
    }

    /// Owner of the note
    #[napi]
    pub fn owner(&self) -> String {
        self.note.owner().hex_public_address()
    }

    /// Compute the nullifier for this note, given the private key of its owner.
    ///
    /// The nullifier is a series of bytes that is published by the note owner
    /// only at the time the note is spent. This key is collected in a massive
    /// 'nullifier set', preventing double-spend.
    #[napi]
    pub fn nullifier(&self, owner_view_key: String, position: BigInt) -> Result<Buffer> {
        let position_u64 = position.get_u64().1;

        let view_key = ViewKey::from_hex(&owner_view_key).map_err(to_napi_err)?;

        let nullifier: &[u8] = &self.note.nullifier(&view_key, position_u64).0;

        Ok(Buffer::from(nullifier))
    }
}
