/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::convert::TryInto;

use neon::prelude::*;

use ironfish_rust::sapling_bls12::{MerkleNoteHash, SpendProof};

pub struct NativeSpendProof {
    pub(crate) proof: SpendProof,
}

impl Finalize for NativeSpendProof {}

impl NativeSpendProof {
    pub fn tree_size(mut cx: FunctionContext) -> JsResult<JsNumber> {
        let spend_proof = cx
            .this()
            .downcast_or_throw::<JsBox<NativeSpendProof>, _>(&mut cx)?;

        Ok(cx.number(spend_proof.proof.tree_size()))
    }

    pub fn root_hash(mut cx: FunctionContext) -> JsResult<JsBuffer> {
        let spend_proof = cx
            .this()
            .downcast_or_throw::<JsBox<NativeSpendProof>, _>(&mut cx)?;

        let mut arr: Vec<u8> = vec![];
        MerkleNoteHash::new(spend_proof.proof.root_hash())
            .write(&mut arr)
            .or_else(|err| cx.throw_error(err.to_string()))?;

        let mut bytes = cx.buffer(arr.len().try_into().unwrap())?;

        cx.borrow_mut(&mut bytes, |data| {
            let slice = data.as_mut_slice();
            slice.clone_from_slice(&arr[..slice.len()]);
        });

        Ok(bytes)
    }

    pub fn nullifier(mut cx: FunctionContext) -> JsResult<JsBuffer> {
        let spend_proof = cx
            .this()
            .downcast_or_throw::<JsBox<NativeSpendProof>, _>(&mut cx)?;

        let nullifier = spend_proof.proof.nullifier();

        let mut bytes = cx.buffer(nullifier.len().try_into().unwrap())?;

        cx.borrow_mut(&mut bytes, |data| {
            let slice = data.as_mut_slice();
            slice.clone_from_slice(&nullifier[..slice.len()]);
        });

        Ok(bytes)
    }
}
