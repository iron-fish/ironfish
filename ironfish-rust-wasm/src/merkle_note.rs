/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{errors::IronfishError, primitives::Scalar, wasm_bindgen_wrapper};
use wasm_bindgen::prelude::*;

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct MerkleNote(ironfish::MerkleNote);
}

#[wasm_bindgen]
impl MerkleNote {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<MerkleNote, IronfishError> {
        Ok(Self(ironfish::MerkleNote::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
            .write(&mut buf)
            .expect("failed to serialize merkle note");
        buf
    }

    #[wasm_bindgen(getter, js_name = merkleHash)]
    pub fn merkle_hash(&self) -> MerkleNoteHash {
        self.0.merkle_hash().into()
    }
}

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct MerkleNoteHash(ironfish::MerkleNoteHash);
}

#[wasm_bindgen]
impl MerkleNoteHash {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<MerkleNoteHash, IronfishError> {
        Ok(Self(ironfish::MerkleNoteHash::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
            .write(&mut buf)
            .expect("failed to serialize merkle note hash");
        buf
    }

    #[wasm_bindgen(js_name = fromValue)]
    pub fn from_value(value: Scalar) -> Self {
        ironfish::MerkleNoteHash(value.as_ref().to_owned()).into()
    }

    #[wasm_bindgen(getter)]
    pub fn value(&self) -> Scalar {
        self.0 .0.into()
    }

    #[wasm_bindgen(js_name = combineHash)]
    pub fn combine_hash(depth: usize, left: &Self, right: &Self) -> Self {
        let hash = ironfish::MerkleNoteHash::combine_hash(depth, &left.0 .0, &right.0 .0);
        ironfish::MerkleNoteHash(hash).into()
    }
}

#[cfg(test)]
mod tests {
    use crate::merkle_note::MerkleNoteHash;
    use hex_literal::hex;
    use wasm_bindgen_test::wasm_bindgen_test;

    #[test]
    #[wasm_bindgen_test]
    fn combine_hash() {
        let a = MerkleNoteHash::deserialize(
            hex!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00").as_slice(),
        )
        .unwrap();
        let b = MerkleNoteHash::deserialize(
            hex!("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb00").as_slice(),
        )
        .unwrap();
        let c = MerkleNoteHash::combine_hash(10, &a, &b);
        assert_eq!(
            c.serialize(),
            hex!("65fa868a24f39bead19143c23b7c37c6966bec5cf5e60269cb7964d407fe3d47")
        );
    }
}
