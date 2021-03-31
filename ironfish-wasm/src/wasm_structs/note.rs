/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish_rust::note::Memo;
use ironfish_rust::sapling_bls12::{Key, Note, SAPLING};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmNote {
    pub(crate) note: Note,
}

#[wasm_bindgen]
impl WasmNote {
    #[wasm_bindgen(constructor)]
    pub fn new(owner: &str, value: u64, memo: &str) -> WasmNote {
        let owner_address = ironfish_rust::PublicAddress::from_hex(SAPLING.clone(), owner).unwrap();
        WasmNote {
            note: Note::new(SAPLING.clone(), owner_address, value, Memo::from(memo)),
        }
    }

    #[wasm_bindgen]
    pub fn deserialize(bytes: &[u8]) -> WasmNote {
        let hasher = SAPLING.clone();
        let cursor: std::io::Cursor<&[u8]> = std::io::Cursor::new(bytes);
        let note = Note::read(cursor, hasher).unwrap();
        WasmNote { note }
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut cursor: std::io::Cursor<Vec<u8>> = std::io::Cursor::new(vec![]);
        self.note.write(&mut cursor).unwrap();
        cursor.into_inner()
    }

    /// Value this note represents.
    #[wasm_bindgen(getter)]
    pub fn value(&self) -> u64 {
        self.note.value()
    }

    /// Arbitrary note the spender can supply when constructing a spend so the
    /// receiver has some record from whence it came.
    /// Note: While this is encrypted with the output, it is not encoded into
    /// the proof in any way.
    #[wasm_bindgen(getter)]
    pub fn memo(&self) -> String {
        self.note.memo().to_string()
    }

    /// Compute the nullifier for this note, given the private key of its owner.
    ///
    /// The nullifier is a series of bytes that is published by the note owner
    /// only at the time the note is spent. This key is collected in a massive
    /// 'nullifier set', preventing double-spend.
    #[wasm_bindgen]
    pub fn nullifier(&self, owner_private_key: &str, position: u64) -> Vec<u8> {
        let private_key = Key::from_hex(SAPLING.clone(), owner_private_key).unwrap();
        self.note.nullifier(&private_key, position).to_vec()
    }
}
