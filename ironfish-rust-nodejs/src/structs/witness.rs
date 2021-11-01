/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::cell::RefCell;
use std::ops::DerefMut;

use neon::prelude::*;

use ironfish_rust::sapling_bls12::{Bls12, Fr, MerkleNoteHash};
use ironfish_rust::witness::{WitnessNode, WitnessTrait};

pub struct JsWitness<'a> {
    pub cx: RefCell<FunctionContext<'a>>,
    pub obj: Handle<'a, JsObject>,
}

/// Implements WitnessTrait on JsWitness so that witnesses from the
/// TypeScript side can be passed into classes that require witnesses,
/// like transactions.
impl WitnessTrait<Bls12> for JsWitness<'_> {
    fn verify(&self, hash: &MerkleNoteHash) -> bool {
        let mut cx = self.cx.borrow_mut();
        let cxm = cx.deref_mut();

        let f = self
            .obj
            .get(cxm, "verify")
            .unwrap()
            .downcast_or_throw::<JsFunction, _>(cxm)
            .unwrap();

        let mut arr: Vec<u8> = vec![];
        hash.write(&mut arr).unwrap();
        let mut bytes = cxm.buffer(arr.len() as u32).unwrap();

        cxm.borrow_mut(&mut bytes, |data| {
            let slice = data.as_mut_slice();
            slice.clone_from_slice(&arr[..slice.len()]);
        });

        f.call(cxm, self.obj, vec![bytes])
            .unwrap()
            .downcast_or_throw::<JsBoolean, _>(cxm)
            .unwrap()
            .value(cxm)
    }

    fn get_auth_path(&self) -> Vec<WitnessNode<Fr>> {
        let mut cx = self.cx.borrow_mut();
        let cxm = cx.deref_mut();

        let f = self
            .obj
            .get(cxm, "authPath")
            .unwrap()
            .downcast_or_throw::<JsFunction, _>(cxm)
            .unwrap();

        let arr = f
            .call::<_, _, JsArray, _>(cxm, self.obj, vec![])
            .unwrap()
            .downcast_or_throw::<JsArray, _>(cxm)
            .unwrap()
            .to_vec(cxm)
            .unwrap();

        arr.iter()
            .map(|element| {
                let cast = element.downcast_or_throw::<JsObject, _>(cxm).unwrap();

                let bytes = cast
                    .get(cxm, "hashOfSibling")
                    .unwrap()
                    .downcast_or_throw::<JsFunction, _>(cxm)
                    .unwrap()
                    .call::<_, _, JsBuffer, _>(cxm, cast, vec![])
                    .unwrap()
                    .downcast_or_throw::<JsBuffer, _>(cxm)
                    .unwrap();

                // hashOfSibling returns a serialized hash, so convert it
                // back into a MerkleNoteHash
                let fr = cxm
                    .borrow(&bytes, |data| {
                        let mut cursor: std::io::Cursor<&[u8]> =
                            std::io::Cursor::new(data.as_slice());
                        MerkleNoteHash::read(&mut cursor)
                    })
                    .unwrap()
                    .0;

                let side = cast
                    .get(cxm, "side")
                    .unwrap()
                    .downcast_or_throw::<JsFunction, _>(cxm)
                    .unwrap()
                    .call::<_, _, JsString, _>(cxm, cast, vec![])
                    .unwrap()
                    .downcast_or_throw::<JsString, _>(cxm)
                    .unwrap()
                    .value(cxm);

                if side == "Left" {
                    WitnessNode::Left(fr)
                } else {
                    WitnessNode::Right(fr)
                }
            })
            .collect()
    }

    fn root_hash(&self) -> Fr {
        let mut cx = self.cx.borrow_mut();
        let cxm = cx.deref_mut();

        let f = self
            .obj
            .get(cxm, "serializeRootHash")
            .unwrap()
            .downcast_or_throw::<JsFunction, _>(cxm)
            .unwrap();

        let bytes = f
            .call::<_, _, JsBuffer, _>(cxm, self.obj, vec![])
            .unwrap()
            .downcast_or_throw::<JsBuffer, _>(cxm)
            .unwrap();

        cx.borrow(&bytes, |data| {
            let mut cursor: std::io::Cursor<&[u8]> = std::io::Cursor::new(data.as_slice());
            MerkleNoteHash::read(&mut cursor)
        })
        .unwrap()
        .0
    }

    fn tree_size(&self) -> u32 {
        let mut cx = self.cx.borrow_mut();
        let cxm = cx.deref_mut();

        let f = self
            .obj
            .get(cxm, "treeSize")
            .unwrap()
            .downcast_or_throw::<JsFunction, _>(cxm)
            .unwrap();

        f.call::<_, _, JsNumber, _>(cxm, self.obj, vec![])
            .unwrap()
            .downcast_or_throw::<JsNumber, _>(cxm)
            .unwrap()
            .value(cxm) as u32
    }
}
