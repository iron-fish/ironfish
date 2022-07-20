/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish_rust::{MerkleNoteHash, SpendProof};
use wasm_bindgen::prelude::*;

use super::WasmIoError;

#[wasm_bindgen]
pub struct WasmSpendProof {
    pub(crate) proof: SpendProof,
}

#[wasm_bindgen]
impl WasmSpendProof {
    #[wasm_bindgen(getter, js_name = "treeSize")]
    pub fn tree_size(&self) -> u32 {
        self.proof.tree_size()
    }

    #[wasm_bindgen(getter, js_name = "rootHash")]
    pub fn root_hash(&self) -> Result<Vec<u8>, JsValue> {
        let mut cursor: std::io::Cursor<Vec<u8>> = std::io::Cursor::new(vec![]);
        MerkleNoteHash::new(self.proof.root_hash())
            .write(&mut cursor)
            .map_err(WasmIoError)?;
        Ok(cursor.into_inner())
    }

    #[wasm_bindgen(getter)]
    pub fn nullifier(&self) -> Vec<u8> {
        self.proof.nullifier().to_vec()
    }
}
