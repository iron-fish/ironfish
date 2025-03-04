/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use blstrs::Scalar;

use super::MerkleNoteHash;
use std::fmt;

/// Witness to a specific node in an authentication path.
///
/// The Left/Right is the Hash of THIS node, but the MerkleHash at node.0 is
/// the hash of the SIBLING node.
#[derive(PartialEq, Eq, Debug, Clone)]
pub enum WitnessNode<H: Clone + PartialEq + fmt::Debug> {
    Left(H),
    Right(H),
}

/// Commitment that a leaf node exists in the tree, with an authentication path
/// and the root_hash of the tree at the time the authentication_path was
/// calculated.
pub trait WitnessTrait {
    /// verify that the root hash and authentication path on this witness is a
    /// valid confirmation that the given element exists at this point in the
    /// tree.
    fn verify(&self, my_hash: &MerkleNoteHash) -> bool;

    fn get_auth_path(&self) -> Vec<WitnessNode<Scalar>>;

    fn root_hash(&self) -> Scalar;

    fn tree_size(&self) -> u32;
}

/// A Rust implementation of a WitnessTrait, used for testing Witness-related
/// code within Rust.
#[derive(Clone, PartialEq, Eq)]
pub struct Witness {
    pub tree_size: usize,
    pub root_hash: Scalar,
    pub auth_path: Vec<WitnessNode<Scalar>>,
}

impl WitnessTrait for Witness {
    fn verify(&self, my_hash: &MerkleNoteHash) -> bool {
        let mut cur_hash = my_hash.0;
        for (i, node) in self.auth_path.iter().enumerate() {
            cur_hash = match node {
                WitnessNode::Left(ref right_hash) => {
                    MerkleNoteHash::combine_hash(i, &cur_hash, right_hash)
                }
                WitnessNode::Right(ref left_hash) => {
                    MerkleNoteHash::combine_hash(i, left_hash, &cur_hash)
                }
            }
        }

        cur_hash == self.root_hash
    }

    fn get_auth_path(&self) -> Vec<WitnessNode<Scalar>> {
        self.auth_path.clone()
    }

    fn root_hash(&self) -> Scalar {
        self.root_hash
    }

    fn tree_size(&self) -> u32 {
        self.tree_size as u32
    }
}

impl fmt::Debug for Witness {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        writeln!(f, "Witness {{")?;
        writeln!(f, "    tree_size: {}", self.tree_size)?;
        writeln!(f, "    root_hash: {:?}", self.root_hash)?;
        writeln!(f, "    auth_path: {{")?;

        for hash in self.auth_path.iter() {
            writeln!(f, "        {:?},", hash)?;
        }
        writeln!(f, "    }}")?;
        writeln!(f, "}}")?;
        Ok(())
    }
}
