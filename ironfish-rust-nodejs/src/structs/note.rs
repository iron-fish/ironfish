/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::convert::TryInto;

use neon::prelude::*;

use ironfish_rust::note::Memo;
use ironfish_rust::sapling_bls12::{Key, Note, SAPLING};

pub struct NativeNote {
    pub(crate) note: Note,
}

impl Finalize for NativeNote {}

impl NativeNote {
    pub fn new(mut cx: FunctionContext) -> JsResult<JsBox<NativeNote>> {
        let owner = cx.argument::<JsString>(0)?.value(&mut cx);
        // TODO: Should be BigInt, but no first-class Neon support
        let value = cx.argument::<JsString>(1)?.value(&mut cx);
        let memo = cx.argument::<JsString>(2)?.value(&mut cx);

        let value_u64: u64 = value
            .parse::<u64>()
            .or_else(|err| cx.throw_error(err.to_string()))?;

        let owner_address = ironfish_rust::PublicAddress::from_hex(SAPLING.clone(), &owner)
            .or_else(|err| cx.throw_error(err.to_string()))?;
        Ok(cx.boxed(NativeNote {
            note: Note::new(SAPLING.clone(), owner_address, value_u64, Memo::from(memo)),
        }))
    }

    pub fn deserialize(mut cx: FunctionContext) -> JsResult<JsBox<NativeNote>> {
        let bytes = cx.argument::<JsBuffer>(0)?;

        let hasher = SAPLING.clone();
        let note = cx
            .borrow(&bytes, |data| Note::read(data.as_slice(), hasher))
            .or_else(|err| cx.throw_error(err.to_string()))?;

        Ok(cx.boxed(NativeNote { note }))
    }

    pub fn serialize(mut cx: FunctionContext) -> JsResult<JsBuffer> {
        let note = cx
            .this()
            .downcast_or_throw::<JsBox<NativeNote>, _>(&mut cx)?;

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

    /// Value this note represents.
    pub fn value(mut cx: FunctionContext) -> JsResult<JsString> {
        let note = cx
            .this()
            .downcast_or_throw::<JsBox<NativeNote>, _>(&mut cx)?;

        // TODO: Should be BigInt, but no first-class Neon support
        Ok(cx.string(note.note.value().to_string()))
    }

    /// Arbitrary note the spender can supply when constructing a spend so the
    /// receiver has some record from whence it came.
    /// Note: While this is encrypted with the output, it is not encoded into
    /// the proof in any way.
    pub fn memo(mut cx: FunctionContext) -> JsResult<JsString> {
        let note = cx
            .this()
            .downcast_or_throw::<JsBox<NativeNote>, _>(&mut cx)?;

        Ok(cx.string(note.note.memo().to_string()))
    }

    /// Compute the nullifier for this note, given the private key of its owner.
    ///
    /// The nullifier is a series of bytes that is published by the note owner
    /// only at the time the note is spent. This key is collected in a massive
    /// 'nullifier set', preventing double-spend.
    pub fn nullifier(mut cx: FunctionContext) -> JsResult<JsBuffer> {
        let note = cx
            .this()
            .downcast_or_throw::<JsBox<NativeNote>, _>(&mut cx)?;
        let owner_private_key = cx.argument::<JsString>(0)?.value(&mut cx);
        // TODO: Should be BigInt, but no first-class Neon support
        let position = cx.argument::<JsString>(1)?.value(&mut cx);

        let position_u64 = position
            .parse::<u64>()
            .or_else(|err| cx.throw_error(err.to_string()))?;

        let private_key = Key::from_hex(SAPLING.clone(), &owner_private_key)
            .or_else(|err| cx.throw_error(err.to_string()))?;

        let nullifier = note.note.nullifier(&private_key, position_u64);

        let mut bytes = cx.buffer(nullifier.len().try_into().unwrap())?;

        cx.borrow_mut(&mut bytes, |data| {
            let slice = data.as_mut_slice();
            slice.clone_from_slice(&nullifier[..slice.len()]);
        });

        Ok(bytes)
    }
}
