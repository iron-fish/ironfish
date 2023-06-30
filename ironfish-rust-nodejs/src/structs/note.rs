/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish::{
    assets::asset::ID_LENGTH as ASSET_ID_LENGTH,
    note::{AMOUNT_VALUE_SIZE, MEMO_SIZE, SCALAR_SIZE},
};
use napi::{bindgen_prelude::*, JsBuffer};
use napi_derive::napi;

use ironfish::Note;

use ironfish::keys::PUBLIC_ADDRESS_SIZE;

use crate::to_napi_err;

use super::NativeViewKey;

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
        memo: String,
        asset_id: JsBuffer,
        sender: String,
    ) -> Result<Self> {
        let value_u64 = value.get_u64().1;
        let owner_address = ironfish::PublicAddress::from_hex(&owner).map_err(to_napi_err)?;
        let sender_address = ironfish::PublicAddress::from_hex(&sender).map_err(to_napi_err)?;

        let buffer = asset_id.into_value()?;
        let asset_id_vec = buffer.as_ref();
        let mut asset_id_bytes = [0; ASSET_ID_LENGTH];
        asset_id_bytes.clone_from_slice(&asset_id_vec[0..ASSET_ID_LENGTH]);
        let asset_id = asset_id_bytes.try_into().map_err(to_napi_err)?;

        Ok(NativeNote {
            note: Note::new(owner_address, value_u64, memo, asset_id, sender_address),
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
        let view_key = NativeViewKey::from_hex(owner_view_key)?;

        self.nullifier_with_key(&view_key, position)
    }

    /// Compute the nullifier for this note, given the private key of its owner.
    ///
    /// The nullifier is a series of bytes that is published by the note owner
    /// only at the time the note is spent. This key is collected in a massive
    /// 'nullifier set', preventing double-spend.
    #[napi]
    pub fn nullifier_with_key(
        &self,
        owner_view_key: &NativeViewKey,
        position: BigInt,
    ) -> Result<Buffer> {
        let position_u64 = position.get_u64().1;

        let nullifier: &[u8] = &self.note.nullifier(&owner_view_key.inner, position_u64).0;

        Ok(Buffer::from(nullifier))
    }
}
