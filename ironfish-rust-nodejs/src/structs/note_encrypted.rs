/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::convert::TryInto;

use neon::prelude::*;

use super::NativeNote;
use ironfish_rust::sapling_bls12;
use ironfish_rust::MerkleNote;

pub struct NativeNoteEncrypted {
    pub(crate) note: sapling_bls12::MerkleNote,
}

impl Finalize for NativeNoteEncrypted {}

impl NativeNoteEncrypted {
    pub fn deserialize(mut cx: FunctionContext) -> JsResult<JsBox<NativeNoteEncrypted>> {
        let bytes = cx.argument::<JsBuffer>(0)?;

        let hasher = sapling_bls12::SAPLING.clone();
        let note = cx
            .borrow(&bytes, |data| {
                let cursor: std::io::Cursor<&[u8]> = std::io::Cursor::new(data.as_slice());
                MerkleNote::read(cursor, hasher)
            })
            .or_else(|err| cx.throw_error(err.to_string()))?;

        Ok(cx.boxed(NativeNoteEncrypted { note }))
    }

    pub fn serialize(mut cx: FunctionContext) -> JsResult<JsBuffer> {
        // Get the `this` value as a `JsBox<NativeNoteEncrypted>`
        let note = cx
            .this()
            .downcast_or_throw::<JsBox<NativeNoteEncrypted>, _>(&mut cx)?;

        let mut arr: Vec<u8> = vec![];
        note.note
            .write(&mut arr)
            .or_else(|err| cx.throw_error(err.to_string()))?;

        let mut bytes = cx.buffer(arr.len().try_into().unwrap())?;

        cx.borrow_mut(&mut bytes, |data| {
            let slice = data.as_mut_slice();
            slice.clone_from_slice(&arr[..slice.len()]);
        });

        Ok(bytes)
    }

    pub fn equals(mut cx: FunctionContext) -> JsResult<JsBoolean> {
        let note = cx
            .this()
            .downcast_or_throw::<JsBox<NativeNoteEncrypted>, _>(&mut cx)?;

        let other = cx.argument::<JsBox<NativeNoteEncrypted>>(0)?;

        Ok(cx.boolean(note.note.eq(&other.note)))
    }

    pub fn merkle_hash(mut cx: FunctionContext) -> JsResult<JsBuffer> {
        let note = cx
            .this()
            .downcast_or_throw::<JsBox<NativeNoteEncrypted>, _>(&mut cx)?;

        let mut cursor: Vec<u8> = Vec::with_capacity(32);
        note.note
            .merkle_hash()
            .write(&mut cursor)
            .or_else(|err| cx.throw_error(err.to_string()))?;

        // Copy hash to JsBuffer
        let mut bytes = cx.buffer(32)?;

        cx.borrow_mut(&mut bytes, |data| {
            let slice = data.as_mut_slice();
            slice.clone_from_slice(&cursor[..slice.len()]);
        });

        Ok(bytes)
    }

    /// Hash two child hashes together to calculate the hash of the
    /// new parent
    pub fn combine_hash(mut cx: FunctionContext) -> JsResult<JsBuffer> {
        let depth = cx.argument::<JsNumber>(0)?.value(&mut cx) as usize;
        let left = cx.argument::<JsBuffer>(1)?;
        let right = cx.argument::<JsBuffer>(2)?;

        let left_hash = cx
            .borrow(&left, |data| {
                let mut left_hash_reader: std::io::Cursor<&[u8]> =
                    std::io::Cursor::new(data.as_slice());
                sapling_bls12::MerkleNoteHash::read(&mut left_hash_reader)
            })
            .or_else(|err| cx.throw_error(err.to_string()))?;

        let right_hash = cx
            .borrow(&right, |data| {
                let mut right_hash_reader: std::io::Cursor<&[u8]> =
                    std::io::Cursor::new(data.as_slice());
                sapling_bls12::MerkleNoteHash::read(&mut right_hash_reader)
            })
            .or_else(|err| cx.throw_error(err.to_string()))?;

        let mut cursor = Vec::with_capacity(32);

        sapling_bls12::MerkleNoteHash::new(sapling_bls12::MerkleNoteHash::combine_hash(
            &sapling_bls12::SAPLING.clone(),
            depth,
            &left_hash.0,
            &right_hash.0,
        ))
        .write(&mut cursor)
        .or_else(|err| cx.throw_error(err.to_string()))?;

        // Copy hash to JsBuffer
        let mut bytes = cx.buffer(32)?;

        cx.borrow_mut(&mut bytes, |data| {
            let slice = data.as_mut_slice();
            slice.clone_from_slice(&cursor[..slice.len()]);
        });

        Ok(bytes)
    }

    /// Returns undefined if the note was unable to be decrypted with the given key.
    pub fn decrypt_note_for_owner(mut cx: FunctionContext) -> JsResult<JsValue> {
        let note = cx
            .this()
            .downcast_or_throw::<JsBox<NativeNoteEncrypted>, _>(&mut cx)?;
        let owner_hex_key = cx.argument::<JsString>(0)?.value(&mut cx);

        let owner_view_key = sapling_bls12::IncomingViewKey::from_hex(
            sapling_bls12::SAPLING.clone(),
            &owner_hex_key,
        )
        .or_else(|err| cx.throw_error(err.to_string()))?;

        Ok(match note.note.decrypt_note_for_owner(&owner_view_key) {
            Ok(note) => cx.boxed(NativeNote { note: { note } }).upcast(),
            Err(_) => cx.undefined().upcast(),
        })
    }

    /// Returns undefined if the note was unable to be decrypted with the given key.
    pub fn decrypt_note_for_spender(mut cx: FunctionContext) -> JsResult<JsValue> {
        let note = cx
            .this()
            .downcast_or_throw::<JsBox<NativeNoteEncrypted>, _>(&mut cx)?;
        let spender_hex_key = cx.argument::<JsString>(0)?.value(&mut cx);

        let spender_view_key = sapling_bls12::OutgoingViewKey::from_hex(
            sapling_bls12::SAPLING.clone(),
            &spender_hex_key,
        )
        .or_else(|err| cx.throw_error(err.to_string()))?;

        Ok(
            match note.note.decrypt_note_for_spender(&spender_view_key) {
                Ok(note) => cx.boxed(NativeNote { note: { note } }).upcast(),
                Err(_) => cx.undefined().upcast(),
            },
        )
    }
}
