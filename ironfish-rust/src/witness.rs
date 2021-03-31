/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use super::{MerkleNoteHash, Sapling};
use std::fmt::{self, Debug};
use std::sync::Arc;

use zcash_primitives::jubjub::JubjubEngine;

/// Witness to a specific node in an authentication path.
///
/// The Left/Right is the Hash of THIS node, but the MerkleHash at node.0 is
/// the hash of the SIBLING node.
#[derive(PartialEq, Debug, Clone)]
pub enum WitnessNode<H: Clone + PartialEq + Debug> {
    Left(H),
    Right(H),
}

/// Commitment that a leaf node exists in the tree, with an authentication path
/// and the root_hash of the tree at the time the authentication_path was
/// calculated.
pub trait WitnessTrait<J: JubjubEngine + pairing::MultiMillerLoop> {
    /// verify that the root hash and authentication path on this witness is a
    /// valid confirmation that the given element exists at this point in the
    /// tree.
    fn verify(&self, my_hash: &MerkleNoteHash<J>) -> bool;

    fn get_auth_path(&self) -> Vec<WitnessNode<J::Fr>>;

    fn root_hash(&self) -> J::Fr;

    fn tree_size(&self) -> u32;
}

/// A Rust implementation of a WitnessTrait, used for testing Witness-related
/// code within Rust.
pub struct Witness<J: JubjubEngine + pairing::MultiMillerLoop> {
    pub hasher: Arc<Sapling<J>>,
    pub tree_size: usize,
    pub root_hash: J::Fr,
    pub auth_path: Vec<WitnessNode<J::Fr>>,
}

/// Implement partial equality, ignoring the Sapling Arc
impl<J: JubjubEngine + pairing::MultiMillerLoop> PartialEq for Witness<J> {
    fn eq(&self, other: &Witness<J>) -> bool {
        self.tree_size == other.tree_size
            && self.root_hash == other.root_hash
            && self.auth_path == other.auth_path
    }
}

impl<J: JubjubEngine + pairing::MultiMillerLoop> WitnessTrait<J> for Witness<J> {
    fn verify(&self, my_hash: &MerkleNoteHash<J>) -> bool {
        let mut cur_hash = my_hash.0;
        for (i, node) in self.auth_path.iter().enumerate() {
            cur_hash = match node {
                WitnessNode::Left(ref right_hash) => {
                    MerkleNoteHash::combine_hash(&self.hasher, i, &cur_hash, right_hash)
                }
                WitnessNode::Right(ref left_hash) => {
                    MerkleNoteHash::combine_hash(&self.hasher, i, left_hash, &cur_hash)
                }
            }
        }

        cur_hash == self.root_hash
    }

    fn get_auth_path(&self) -> Vec<WitnessNode<J::Fr>> {
        self.auth_path.clone()
    }

    fn root_hash(&self) -> J::Fr {
        self.root_hash
    }

    fn tree_size(&self) -> u32 {
        self.tree_size as u32
    }
}

impl<J: JubjubEngine + pairing::MultiMillerLoop> fmt::Debug for Witness<J> {
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
