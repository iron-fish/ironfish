/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use super::{
    note::Note,
    witness::{Witness, WitnessNode},
    MerkleNoteHash,
};
use blstrs::Scalar;
use ironfish_frost::{participant::Identity, participant::Secret};
use ironfish_zkp::constants::TREE_DEPTH;
use rand::{thread_rng, Rng};

/// Given a note, construct a Witness with a valid root_hash and authentication
/// path placing that note at a random location in a Merkle tree.
pub fn make_fake_witness(note: &Note) -> Witness {
    let mut rng = thread_rng();
    let mut witness_auth_path = vec![];
    for _ in 0..TREE_DEPTH {
        witness_auth_path.push(match rng.gen() {
            false => WitnessNode::Left(Scalar::from(rng.gen::<u64>())),
            true => WitnessNode::Right(Scalar::from(rng.gen::<u64>())),
        })
    }
    let root_hash = auth_path_to_root_hash(&witness_auth_path, note.commitment_point());
    Witness {
        auth_path: witness_auth_path,
        root_hash,
        tree_size: 1400,
    }
}

/// Helper function to calculate a root hash given an authentication path from
/// a specific child_hash.
///
/// Currently marked for test-only compilation,
/// but it may be useful to publish
/// something like this in the future.
pub(crate) fn auth_path_to_root_hash(
    auth_path: &[WitnessNode<Scalar>],
    child_hash: Scalar,
) -> Scalar {
    let mut cur = child_hash;

    for (i, node) in auth_path.iter().enumerate() {
        cur = match node {
            WitnessNode::Left(ref sibling_hash) => {
                MerkleNoteHash::combine_hash(i, &cur, sibling_hash)
            }
            WitnessNode::Right(ref sibling_hash) => {
                MerkleNoteHash::combine_hash(i, sibling_hash, &cur)
            }
        }
    }

    cur
}

/// Helper function to create a list of random identifiers for multisig participants.
pub fn create_multisig_identities(num_identifiers: usize) -> Vec<Identity> {
    (0..num_identifiers)
        .map(|_| Secret::random(thread_rng()).to_identity())
        .collect()
}
