/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use napi::bindgen_prelude::*;
use napi_derive::napi;

use ironfish_rust::sapling_bls12;
use ironfish_rust::MerkleNote;

#[napi(js_name = "NoteEncrypted")]
pub struct NativeNoteEncrypted {
    pub(crate) note: sapling_bls12::MerkleNote,
}

#[napi]
impl NativeNoteEncrypted {
    #[napi(constructor)]
    pub fn new(bytes: Buffer) -> Result<Self> {
        let hasher = sapling_bls12::SAPLING.clone();

        let note = MerkleNote::read(bytes.as_ref(), hasher)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        Ok(NativeNoteEncrypted { note })
    }

    #[napi]
    pub fn serialize(&self) -> Result<Buffer> {
        let mut vec: Vec<u8> = vec![];
        self.note
            .write(&mut vec)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        Ok(Buffer::from(vec))
    }

    #[napi]
    pub fn equals(&self, other: &NativeNoteEncrypted) -> bool {
        self.note.eq(&other.note)
    }

    #[napi]
    pub fn merkle_hash(&self) -> Result<Buffer> {
        let mut vec: Vec<u8> = Vec::with_capacity(32);
        self.note
            .merkle_hash()
            .write(&mut vec)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        Ok(Buffer::from(vec))
    }

    /// Hash two child hashes together to calculate the hash of the
    /// new parent
    #[napi]
    pub fn combine_hash(depth: i64, left: Buffer, right: Buffer) -> Result<Buffer> {
        let left_hash = sapling_bls12::MerkleNoteHash::read(left.as_ref())
            .map_err(|err| Error::from_reason(err.to_string()))?;

        let right_hash = sapling_bls12::MerkleNoteHash::read(right.as_ref())
            .map_err(|err| Error::from_reason(err.to_string()))?;

        let converted_depth: usize = depth
            .try_into()
            .map_err(|_| Error::from_reason("Value could not fit in usize".to_string()))?;

        let mut vec = Vec::with_capacity(32);

        sapling_bls12::MerkleNoteHash::new(sapling_bls12::MerkleNoteHash::combine_hash(
            &sapling_bls12::SAPLING.clone(),
            converted_depth,
            &left_hash.0,
            &right_hash.0,
        ))
        .write(&mut vec)
        .map_err(|err| Error::from_reason(err.to_string()))?;

        Ok(Buffer::from(vec))
    }

    /// Returns undefined if the note was unable to be decrypted with the given key.
    #[napi]
    pub fn decrypt_note_for_owner(&self, incoming_hex_key: String) -> Result<Option<Buffer>> {
        let incoming_view_key = sapling_bls12::IncomingViewKey::from_hex(
            sapling_bls12::SAPLING.clone(),
            &incoming_hex_key,
        )
        .map_err(|err| Error::from_reason(err.to_string()))?;

        Ok(match self.note.decrypt_note_for_owner(&incoming_view_key) {
            Ok(note) => {
                let mut vec = vec![];
                note.write(&mut vec)
                    .map_err(|err| Error::from_reason(err.to_string()))?;
                Some(Buffer::from(vec))
            }
            Err(_) => None,
        })
    }

    /// Returns undefined if the note was unable to be decrypted with the given key.
    #[napi]
    pub fn decrypt_note_for_spender(&self, outgoing_hex_key: String) -> Result<Option<Buffer>> {
        let outgoing_view_key = sapling_bls12::OutgoingViewKey::from_hex(
            sapling_bls12::SAPLING.clone(),
            &outgoing_hex_key,
        )
        .map_err(|err| Error::from_reason(err.to_string()))?;
        Ok(
            match self.note.decrypt_note_for_spender(&outgoing_view_key) {
                Ok(note) => {
                    let mut vec = vec![];
                    note.write(&mut vec)
                        .map_err(|err| Error::from_reason(err.to_string()))?;
                    Some(Buffer::from(vec))
                }
                Err(_) => None,
            },
        )
    }
}
