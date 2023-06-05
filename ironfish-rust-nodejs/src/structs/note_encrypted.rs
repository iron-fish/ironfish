/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish::IncomingViewKey;
use ironfish::MerkleNoteHash;
use ironfish::OutgoingViewKey;
use napi::bindgen_prelude::*;
use napi::JsBuffer;
use napi_derive::napi;

use ironfish::merkle_note::NOTE_ENCRYPTION_KEY_SIZE;
use ironfish::note::ENCRYPTED_NOTE_SIZE;
use ironfish::serializing::aead::MAC_SIZE;
use ironfish::MerkleNote;

use crate::to_napi_err;

#[napi]
pub const NOTE_ENCRYPTION_KEY_LENGTH: u32 = NOTE_ENCRYPTION_KEY_SIZE as u32;

#[napi]
pub const MAC_LENGTH: u32 = MAC_SIZE as u32;

#[napi]
pub const ENCRYPTED_NOTE_PLAINTEXT_LENGTH: u32 = ENCRYPTED_NOTE_SIZE as u32 + MAC_LENGTH;

#[napi]
pub const ENCRYPTED_NOTE_LENGTH: u32 =
    NOTE_ENCRYPTION_KEY_LENGTH + ENCRYPTED_NOTE_PLAINTEXT_LENGTH + 96;

#[napi(js_name = "NoteEncrypted")]
pub struct NativeNoteEncrypted {
    pub(crate) note: MerkleNote,
}

#[napi]
impl NativeNoteEncrypted {
    #[napi(constructor)]
    pub fn new(js_bytes: JsBuffer) -> Result<Self> {
        let bytes = js_bytes.into_value()?;
        let note = MerkleNote::read(bytes.as_ref()).map_err(to_napi_err)?;

        Ok(NativeNoteEncrypted { note })
    }

    #[napi]
    pub fn serialize(&self) -> Result<Buffer> {
        let mut vec: Vec<u8> = vec![];
        self.note.write(&mut vec).map_err(to_napi_err)?;

        Ok(Buffer::from(vec))
    }

    #[napi]
    pub fn equals(&self, other: &NativeNoteEncrypted) -> bool {
        self.note.eq(&other.note)
    }

    /// The commitment hash of the note
    /// This hash is what gets used for the leaf nodes in a Merkle Tree.
    #[napi]
    pub fn hash(&self) -> Result<Buffer> {
        let mut vec: Vec<u8> = Vec::with_capacity(32);
        self.note
            .merkle_hash()
            .write(&mut vec)
            .map_err(to_napi_err)?;

        Ok(Buffer::from(vec))
    }

    /// Hash two child hashes together to calculate the hash of the
    /// new parent
    #[napi]
    pub fn combine_hash(depth: i64, js_left: JsBuffer, js_right: JsBuffer) -> Result<Buffer> {
        let left = js_left.into_value()?;
        let right = js_right.into_value()?;

        let left_hash = MerkleNoteHash::read(left.as_ref()).map_err(to_napi_err)?;

        let right_hash = MerkleNoteHash::read(right.as_ref()).map_err(to_napi_err)?;

        let converted_depth: usize = depth
            .try_into()
            .map_err(|_| to_napi_err("Value could not fit in usize"))?;

        let mut vec = Vec::with_capacity(32);

        MerkleNoteHash::new(MerkleNoteHash::combine_hash(
            converted_depth,
            &left_hash.0,
            &right_hash.0,
        ))
        .write(&mut vec)
        .map_err(to_napi_err)?;

        Ok(Buffer::from(vec))
    }

    /// Returns undefined if the note was unable to be decrypted with the given key.
    #[napi]
    pub fn decrypt_note_for_owner(&self, incoming_hex_key: String) -> Result<Option<Buffer>> {
        let incoming_view_key =
            IncomingViewKey::from_hex(&incoming_hex_key).map_err(to_napi_err)?;

        Ok(match self.note.decrypt_note_for_owner(&incoming_view_key) {
            Ok(note) => {
                let mut vec = vec![];
                note.write(&mut vec).map_err(to_napi_err)?;
                Some(Buffer::from(vec))
            }
            Err(_) => None,
        })
    }

    /// Returns undefined if the note was unable to be decrypted with the given key.
    #[napi]
    pub fn decrypt_note_for_spender(&self, outgoing_hex_key: String) -> Result<Option<Buffer>> {
        let outgoing_view_key =
            OutgoingViewKey::from_hex(&outgoing_hex_key).map_err(to_napi_err)?;
        Ok(
            match self.note.decrypt_note_for_spender(&outgoing_view_key) {
                Ok(note) => {
                    let mut vec = vec![];
                    note.write(&mut vec).map_err(to_napi_err)?;
                    Some(Buffer::from(vec))
                }
                Err(_) => None,
            },
        )
    }
}
