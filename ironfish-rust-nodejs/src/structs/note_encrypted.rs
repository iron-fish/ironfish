/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::to_napi_err;
use ironfish::merkle_note::NOTE_ENCRYPTION_KEY_SIZE;
use ironfish::note::ENCRYPTED_NOTE_SIZE;
use ironfish::note::PLAINTEXT_NOTE_SIZE;
use ironfish::serializing::aead::MAC_SIZE;
use ironfish::IncomingViewKey;
use ironfish::MerkleNote;
use ironfish::MerkleNoteHash;
use ironfish::Note;
use ironfish::OutgoingViewKey;
use napi::bindgen_prelude::*;
use napi::JsBuffer;
use napi_derive::napi;

#[napi]
pub const NOTE_ENCRYPTION_KEY_LENGTH: u32 = NOTE_ENCRYPTION_KEY_SIZE as u32;

#[napi]
pub const MAC_LENGTH: u32 = MAC_SIZE as u32;

#[napi]
pub const ENCRYPTED_NOTE_PLAINTEXT_LENGTH: u32 = ENCRYPTED_NOTE_SIZE as u32 + MAC_LENGTH;

#[napi]
pub const ENCRYPTED_NOTE_LENGTH: u32 =
    NOTE_ENCRYPTION_KEY_LENGTH + ENCRYPTED_NOTE_PLAINTEXT_LENGTH + 96;

#[inline]
fn try_map<T, I, F, R, E>(items: I, f: F) -> std::result::Result<Vec<R>, E>
where
    I: IntoIterator<Item = T>,
    I::IntoIter: ExactSizeIterator,
    F: Fn(T) -> std::result::Result<R, E>,
{
    let items = items.into_iter();
    let mut result = Vec::with_capacity(items.len());
    for item in items {
        result.push(f(item)?);
    }
    Ok(result)
}

#[inline]
fn decrypted_note_to_buffer<E>(note: std::result::Result<Note, E>) -> Result<Option<Buffer>> {
    match note {
        Ok(note) => {
            let mut buf = [0u8; PLAINTEXT_NOTE_SIZE];
            note.write(&mut buf[..]).map_err(to_napi_err)?;
            Ok(Some(Buffer::from(&buf[..])))
        }
        Err(_) => Ok(None),
    }
}

#[napi(js_name = "NoteEncrypted")]
pub struct NativeNoteEncrypted {
    pub(crate) note: MerkleNote,
}

#[napi]
impl NativeNoteEncrypted {
    #[napi(constructor)]
    pub fn new(js_bytes: JsBuffer, skip_validation: Option<bool>) -> Result<Self> {
        let bytes = js_bytes.into_value()?;
        let skip_validation = skip_validation.unwrap_or(false);

        let note = if !skip_validation {
            MerkleNote::read(bytes.as_ref())
        } else {
            MerkleNote::read_unchecked(bytes.as_ref())
        }
        .map_err(to_napi_err)?;

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
    pub fn decrypt_note_for_owner(&self, incoming_view_key: JsBuffer) -> Result<Option<Buffer>> {
        let incoming_view_key =
            IncomingViewKey::read(&*incoming_view_key.into_value()?).map_err(to_napi_err)?;
        let decrypted_note = self.note.decrypt_note_for_owner(&incoming_view_key);
        decrypted_note_to_buffer(decrypted_note).map_err(to_napi_err)
    }

    #[napi]
    pub fn decrypt_note_for_owners(
        &self,
        incoming_view_keys: Vec<JsBuffer>,
    ) -> Result<Vec<Option<Buffer>>> {
        let incoming_view_keys = try_map(incoming_view_keys, |incoming_view_key| {
            IncomingViewKey::read(&*incoming_view_key.into_value()?).map_err(to_napi_err)
        })?;
        let decrypted_notes = self.note.decrypt_note_for_owners(&incoming_view_keys);
        try_map(decrypted_notes, decrypted_note_to_buffer).map_err(to_napi_err)
    }

    /// Returns undefined if the note was unable to be decrypted with the given key.
    #[napi]
    pub fn decrypt_note_for_spender(&self, outgoing_view_key: JsBuffer) -> Result<Option<Buffer>> {
        let outgoing_view_key =
            OutgoingViewKey::read(&*outgoing_view_key.into_value()?).map_err(to_napi_err)?;
        let decrypted_note = self.note.decrypt_note_for_spender(&outgoing_view_key);
        decrypted_note_to_buffer(decrypted_note).map_err(to_napi_err)
    }
}
