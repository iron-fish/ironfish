/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// Implement a merkle note to store all the values that need to go into a merkle tree.
/// A tree containing these values can serve as a snapshot of the entire chain.
use super::serializing::read_scalar;

use bls12_381::Scalar;
use ff::PrimeField;
use group::Curve;
use jubjub::ExtendedPoint;

use std::io;
use zcash_primitives::pedersen_hash::{pedersen_hash, Personalization};

#[derive(Clone, Debug, Eq)]
pub struct MerkleNoteHash(pub Scalar);

impl PartialEq for MerkleNoteHash {
    fn eq(&self, other: &MerkleNoteHash) -> bool {
        self.0.eq(&other.0)
    }
}

impl MerkleNoteHash {
    // Tuple struct constructors can't be used with type aliases,
    // so explicitly define one here
    pub fn new(fr: Scalar) -> MerkleNoteHash {
        MerkleNoteHash(fr)
    }

    pub fn read<R: io::Read>(reader: R) -> io::Result<MerkleNoteHash> {
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
    pub fn combine_hash(depth: usize, left: &Scalar, right: &Scalar) -> Scalar {
        let lhs = left.to_le_bits();
        let rhs = right.to_le_bits();
        let num_bits = <Scalar as PrimeField>::NUM_BITS as usize;
        ExtendedPoint::from(pedersen_hash(
            Personalization::MerkleTree(depth),
            lhs.into_iter()
                .take(num_bits)
                .chain(rhs.into_iter().take(num_bits))
                .cloned(),
        ))
        .to_affine()
        .get_u()
    }
}
