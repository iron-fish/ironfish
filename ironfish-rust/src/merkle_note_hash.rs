/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// Implement a merkle note to store all the values that need to go into a merkle tree.
/// A tree containing these values can serve as a snapshot of the entire chain.
use super::{serializing::read_scalar, Sapling};

use ff::{BitIterator, PrimeField};

use std::io;
use zcash_primitives::jubjub::JubjubEngine;
use zcash_primitives::pedersen_hash::{pedersen_hash, Personalization};

#[derive(Clone, Debug, Eq)]
pub struct MerkleNoteHash<J: JubjubEngine + pairing::MultiMillerLoop>(pub J::Fr);

impl<J: JubjubEngine + pairing::MultiMillerLoop> PartialEq for MerkleNoteHash<J> {
    fn eq(&self, other: &MerkleNoteHash<J>) -> bool {
        self.0.eq(&other.0)
    }
}

impl<J: JubjubEngine + pairing::MultiMillerLoop> MerkleNoteHash<J> {
    // Tuple struct constructors can't be used with type aliases,
    // so explicitly define one here
    pub fn new(fr: J::Fr) -> MerkleNoteHash<J> {
        MerkleNoteHash(fr)
    }

    pub fn read<R: io::Read>(reader: R) -> io::Result<MerkleNoteHash<J>> {
        let res = read_scalar(reader).map_err(|_| {
            io::Error::new(io::ErrorKind::InvalidInput, "Unable to convert note hash")
        });
        Ok(MerkleNoteHash(res.unwrap()))
    }

    pub fn write<W: io::Write>(&self, writer: &mut W) -> io::Result<()> {
        writer.write_all(self.0.to_repr().as_ref())
    }

    /// Hash two child hashes together to calculate the hash of the
    /// new parent
    pub fn combine_hash(sapling: &Sapling<J>, depth: usize, left: &J::Fr, right: &J::Fr) -> J::Fr {
        let mut lhs: Vec<bool> = BitIterator::<u8, _>::new(left.to_repr()).collect();
        let mut rhs: Vec<bool> = BitIterator::<u8, _>::new(right.to_repr()).collect();
        lhs.reverse();
        rhs.reverse();
        let num_bits = <J::Fr as PrimeField>::NUM_BITS as usize;
        pedersen_hash::<J, _>(
            Personalization::MerkleTree(depth),
            lhs.into_iter()
                .take(num_bits)
                .chain(rhs.into_iter().take(num_bits)),
            &sapling.jubjub,
        )
        .to_xy()
        .0
    }
}
