/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use napi::bindgen_prelude::*;
use napi_derive::napi;

use ironfish_rust::sapling_bls12::{MerkleNoteHash, SpendProof};

#[napi]
pub struct NativeSpendProof {
    pub(crate) proof: SpendProof,
}

#[napi]
impl NativeSpendProof {
    #[napi]
    pub fn tree_size(&self) -> u32 {
        self.proof.tree_size()
    }

    #[napi]
    pub fn root_hash(&self) -> Result<Buffer> {
        let mut vec: Vec<u8> = vec![];

        MerkleNoteHash::new(self.proof.root_hash())
            .write(&mut vec)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        Ok(Buffer::from(vec))
    }

    #[napi]
    pub fn nullifier(&self) -> Buffer {
        let nullifier = self.proof.nullifier();

        Buffer::from(nullifier.as_ref())
    }
}
