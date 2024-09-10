/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::cell::RefCell;
use std::ops::Deref;

use ironfish::sapling_bls12::Scalar;
use ironfish::test_util::make_fake_witness;
use ironfish::witness::Witness;
use ironfish::MerkleNoteHash;
use napi::bindgen_prelude::*;
use napi::Env;
use napi::JsObject;

use super::NativeNote;
use ironfish::witness::{WitnessNode, WitnessTrait};
use napi_derive::napi;

pub struct JsWitness {
    pub cx: RefCell<Env>,
    pub obj: Object,
}

/// Implements WitnessTrait on JsWitness so that witnesses from the
/// TypeScript side can be passed into classes that require witnesses,
/// like transactions.
impl WitnessTrait for JsWitness {
    fn verify(&self, hash: &MerkleNoteHash) -> bool {
        let f: JsFunction = self.obj.get("verify").unwrap().unwrap();

        let cx = self.cx.borrow();

        let mut arr: Vec<u8> = vec![];
        hash.write(&mut arr).unwrap();

        let buf = cx.create_buffer_with_data(arr).unwrap().into_raw();
        let args = [buf];

        f.call(Some(&self.obj), &args)
            .unwrap()
            .coerce_to_bool()
            .unwrap()
            .get_value()
            .unwrap()
    }

    fn get_auth_path(&self) -> Vec<WitnessNode<Scalar>> {
        let f: JsFunction = self.obj.get("authPath").unwrap().unwrap();

        let args: &[napi::JsBuffer; 0] = &[];
        let arr: JsObject = f
            .call(Some(&self.obj), args)
            .unwrap()
            .coerce_to_object()
            .unwrap();

        let len = arr.get_array_length().unwrap();

        let mut witness_nodes: Vec<WitnessNode<Scalar>> = vec![];

        for i in 0..len {
            let element: JsObject = arr.get_element(i).unwrap();

            let hash_of_sibling: JsFunction = element.get("hashOfSibling").unwrap().unwrap();

            let bytes: napi::JsBuffer = hash_of_sibling
                .call(Some(&element), args)
                .unwrap()
                .try_into()
                .unwrap();

            let fr = MerkleNoteHash::read(bytes.into_value().unwrap().deref())
                .unwrap()
                .0;

            let side_fn: JsFunction = element.get("side").unwrap().unwrap();

            let side_utf8 = side_fn
                .call(Some(&element), args)
                .unwrap()
                .coerce_to_string()
                .unwrap()
                .into_utf8()
                .unwrap();
            let side = side_utf8.as_str().unwrap();

            if side == "Left" {
                witness_nodes.push(WitnessNode::Left(fr))
            } else {
                witness_nodes.push(WitnessNode::Right(fr))
            }
        }

        witness_nodes
    }

    fn root_hash(&self) -> Scalar {
        let f: JsFunction = self.obj.get("serializeRootHash").unwrap().unwrap();

        let args: &[napi::JsBuffer; 0] = &[];

        let bytes: napi::JsBuffer = f.call(Some(&self.obj), args).unwrap().try_into().unwrap();

        MerkleNoteHash::read(bytes.into_value().unwrap().deref())
            .unwrap()
            .0
    }

    fn tree_size(&self) -> u32 {
        let f: JsFunction = self.obj.get("treeSize").unwrap().unwrap();

        let args: &[napi::JsBuffer; 0] = &[];

        f.call(Some(&self.obj), args)
            .unwrap()
            .coerce_to_number()
            .unwrap()
            .get_uint32()
            .unwrap()
    }
}

#[napi(object)]
pub struct NativeWitness {
    pub tree_size: u32,
    pub root_hash: Buffer,
    pub auth_path: Vec<NativeWitnessNode>,
}

impl NativeWitness {
    pub fn new(witness: Witness) -> Self {
        let tree_size = witness.tree_size as u32;

        let root_hash = Buffer::from(witness.root_hash.to_bytes_le().to_vec());

        let mut auth_path: Vec<NativeWitnessNode> = Vec::new();

        for node in witness.get_auth_path() {
            match node {
                WitnessNode::Left(hash) => {
                    auth_path.push(NativeWitnessNode {
                        side: 0,
                        hash_of_sibling: Buffer::from(hash.to_bytes_le().to_vec()),
                    });
                }
                WitnessNode::Right(hash) => {
                    auth_path.push(NativeWitnessNode {
                        side: 1,
                        hash_of_sibling: Buffer::from(hash.to_bytes_le().to_vec()),
                    });
                }
            }
        }

        NativeWitness {
            tree_size,
            root_hash,
            auth_path,
        }
    }
}

#[napi(object)]
pub struct NativeWitnessNode {
    pub side: u8,
    pub hash_of_sibling: Buffer,
}

#[napi]
pub fn make_test_witness(note: &NativeNote) -> NativeWitness {
    let witness = make_fake_witness(&note.note);

    NativeWitness::new(witness)
}
