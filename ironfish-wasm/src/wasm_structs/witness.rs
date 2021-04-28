/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

use ironfish_rust::sapling_bls12::{Bls12, Fr, MerkleNoteHash};
use ironfish_rust::witness::{WitnessNode, WitnessTrait};

use super::panic_hook;

#[wasm_bindgen(typescript_custom_section)]
const IWITNESS: &'static str = r#"
interface IWitness {
    verify(myHash: Uint8Array): bool;
    authPath(): IWitnessNode[];
    treeSize(): number;
    serializeRootHash(): Uint8Array;
}
"#;

#[wasm_bindgen]
/// Structural representation of a witness from TypeScript.
/// The IWitness TypeScript interface above must be manually updated
/// if changing this struct.
extern "C" {
    #[wasm_bindgen(typescript_type = "IWitness")]
    pub type JsWitness;

    #[wasm_bindgen(method)]
    pub fn verify(this: &JsWitness, hash: &[u8]) -> bool;

    #[wasm_bindgen(method, js_name = "authPath")]
    pub fn auth_path(this: &JsWitness) -> js_sys::Array;

    #[wasm_bindgen(method, js_name = "treeSize")]
    pub fn tree_size(this: &JsWitness) -> u32;

    #[wasm_bindgen(method, js_name = "serializeRootHash")]
    pub fn serialize_root_hash(this: &JsWitness) -> Vec<u8>;
}

#[wasm_bindgen(typescript_custom_section)]
const IWITNESSNODE: &'static str = r#"
interface IWitnessNode {
    side(): 'Left' | 'Right';
    hashOfSibling(): Uint8Array;
}
"#;

#[wasm_bindgen]
/// Structural representation of a WitnessNode from TypeScript
/// The IWitnessNode TypeScript interface above must be manually updated
/// if changing this struct.
extern "C" {
    #[wasm_bindgen(typescript_type = "IWitnessNode")]
    pub type JsWitnessNode;

    #[wasm_bindgen(method)]
    pub fn side(this: &JsWitnessNode) -> String;

    #[wasm_bindgen(method, js_name = "hashOfSibling")]
    pub fn hash_of_sibling(this: &JsWitnessNode) -> Vec<u8>;
}

/// Implements WitnessTrait on JsWitness so that witnesses from the
/// TypeScript side can be passed into classes that require witnesses,
/// like transactions.
impl WitnessTrait<Bls12> for JsWitness {
    fn verify(&self, hash: &MerkleNoteHash) -> bool {
        panic_hook::set_once();

        let mut cursor: std::io::Cursor<Vec<u8>> = std::io::Cursor::new(vec![]);
        hash.write(&mut cursor).unwrap();

        self.verify(&cursor.into_inner())
    }

    fn get_auth_path(&self) -> Vec<WitnessNode<Fr>> {
        panic_hook::set_once();

        self.auth_path()
            .iter()
            .map(|element| {
                // Unchecked cast here so that wasm-bindgen allows duck-typed objects
                // rather than asserting that the object is an instance of JsWitnessNode
                let cast = element.unchecked_into::<JsWitnessNode>();

                // hashOfSibling returns a serialized hash, so convert it
                // back into a MerkleNoteHash
                let bytes = cast.hash_of_sibling();
                let mut cursor = std::io::Cursor::new(&bytes);
                let fr = MerkleNoteHash::read(&mut cursor).unwrap().0;

                if cast.side() == "Left" {
                    WitnessNode::Left(fr)
                } else {
                    WitnessNode::Right(fr)
                }
            })
            .collect()
    }

    fn root_hash(&self) -> Fr {
        panic_hook::set_once();

        // Convert the serialized root hash back to a Fr
        let bytes = self.serialize_root_hash();
        let mut cursor: std::io::Cursor<&[u8]> = std::io::Cursor::new(&bytes);
        MerkleNoteHash::read(&mut cursor).unwrap().0
    }

    fn tree_size(&self) -> u32 {
        self.tree_size()
    }
}
