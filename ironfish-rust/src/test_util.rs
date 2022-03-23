/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use super::{
    note::Note,
    witness::{Witness, WitnessNode},
    MerkleNoteHash, Sapling,
};
use rand::{thread_rng, Rng};
use std::sync::Arc;
use zcash_proofs::circuit::sapling::TREE_DEPTH;

/// Given a note, construct a Witness with a valid root_hash and authentication
/// path placing that note at a random location in a Merkle tree.
#[cfg(test)]
pub(crate) fn make_fake_witness(sapling: Arc<Sapling>, note: &Note) -> Witness {
    let mut rng = thread_rng();
    let mut buffer = [0u8; 64];
    thread_rng().fill(&mut buffer[..]);

    let mut witness_auth_path = vec![];
    for _ in 0..TREE_DEPTH {
        witness_auth_path.push(match rng.gen() {
            false => WitnessNode::Left(Scalar::from(rng.gen::<u64>())),
            true => WitnessNode::Right(Scalar::from(rng.gen::<u64>())),
        })
    }
    let root_hash = auth_path_to_root_hash(&sapling, &witness_auth_path, note.commitment_point());
    Witness {
        hasher: sapling.clone(),
        auth_path: witness_auth_path,
        root_hash: root_hash,
        tree_size: 1400,
    }
}

/// Helper function to calculate a root hash given an authentication path from
/// a specific child_hash.
///
/// Currently marked for test-only compilation,
/// but it may be useful to publish
/// something like this in the future.
#[cfg(test)]
use bls12_381::Scalar;

pub(crate) fn auth_path_to_root_hash(
    sapling: &Sapling,
    auth_path: &Vec<WitnessNode<Scalar>>,
    child_hash: Scalar,
) -> Scalar {
    let mut cur = child_hash.clone();

    for (i, node) in auth_path.iter().enumerate() {
        cur = match node {
            WitnessNode::Left(ref sibling_hash) => {
                MerkleNoteHash::combine_hash(sapling, i, &cur, &sibling_hash.clone())
            }
            WitnessNode::Right(ref sibling_hash) => {
                MerkleNoteHash::combine_hash(sapling, i, &sibling_hash.clone(), &cur)
            }
        }
    }

    cur
}
