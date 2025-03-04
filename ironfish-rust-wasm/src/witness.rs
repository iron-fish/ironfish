/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{merkle_note::MerkleNoteHash, primitives::Scalar, wasm_bindgen_wrapper};
use ironfish::witness::WitnessTrait;
use wasm_bindgen::prelude::*;

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct Witness(ironfish::witness::Witness);
}

#[wasm_bindgen]
impl Witness {
    #[wasm_bindgen(constructor)]
    pub fn new(tree_size: usize, root_hash: MerkleNoteHash, auth_path: Vec<WitnessNode>) -> Self {
        Self(ironfish::witness::Witness {
            tree_size,
            root_hash: root_hash.value().into(),
            auth_path: auth_path.into_iter().map(WitnessNode::into).collect(),
        })
    }

    #[wasm_bindgen(getter, js_name = treeSize)]
    pub fn tree_size(&self) -> usize {
        self.0.tree_size
    }

    #[wasm_bindgen(getter, js_name = rootHash)]
    pub fn root_hash(&self) -> Scalar {
        self.0.root_hash.into()
    }

    #[wasm_bindgen(getter, js_name = authPath)]
    pub fn auth_path(&self) -> Vec<WitnessNode> {
        self.0
            .auth_path
            .iter()
            .cloned()
            .map(WitnessNode::from)
            .collect()
    }

    #[wasm_bindgen]
    pub fn verify(&self, hash: &MerkleNoteHash) -> bool {
        self.0.verify(hash.as_ref())
    }
}

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct WitnessNode(ironfish::witness::WitnessNode<blstrs::Scalar>);
}

#[wasm_bindgen]
impl WitnessNode {
    #[wasm_bindgen]
    pub fn left(hash: Scalar) -> Self {
        Self(ironfish::witness::WitnessNode::Left(hash.into()))
    }

    #[wasm_bindgen]
    pub fn right(hash: Scalar) -> Self {
        Self(ironfish::witness::WitnessNode::Right(hash.into()))
    }

    #[wasm_bindgen(getter)]
    pub fn is_left(&self) -> bool {
        match self.0 {
            ironfish::witness::WitnessNode::Left(_) => true,
            ironfish::witness::WitnessNode::Right(_) => false,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn is_right(&self) -> bool {
        !self.is_left()
    }

    #[wasm_bindgen(getter)]
    pub fn hash(&self) -> MerkleNoteHash {
        let value = match self.0 {
            ironfish::witness::WitnessNode::Left(ref hash) => hash,
            ironfish::witness::WitnessNode::Right(ref hash) => hash,
        }
        .to_owned()
        .into();
        MerkleNoteHash::from_value(value)
    }
}
