use std::slice;

use bls12_381::Scalar;
use byteorder::{LittleEndian, WriteBytesExt};
use group::{Curve, GroupEncoding};
use jubjub::ExtendedPoint;
use rand::{thread_rng, Rng};
use zcash_primitives::{
    constants::{self, GH_FIRST_BLOCK, NOTE_COMMITMENT_RANDOMNESS_GENERATOR},
    pedersen_hash::{pedersen_hash, Personalization},
};

use crate::primitives::asset_type::AssetInfo;

/// A mint asset note represents an asset with newly added supply in an owner's
/// account
pub struct MintAssetNote {
    pub(crate) asset_info: AssetInfo,
    pub(crate) randomness: jubjub::Fr,
    pub(crate) value: u64,
}

impl MintAssetNote {
    pub fn new(asset_info: AssetInfo, value: u64) -> Self {
        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);

        let randomness: jubjub::Fr = jubjub::Fr::from_bytes_wide(&buffer);

        Self {
            asset_info,
            randomness,
            value,
        }
    }

    pub fn commitment_point(&self) -> Scalar {
        jubjub::ExtendedPoint::from(self.commitment_full_point())
            .to_affine()
            .get_u()
    }

    fn commitment_full_point(&self) -> jubjub::SubgroupPoint {
        // Calculate the note contents, as bytes
        let mut note_contents = vec![];

        // Write the asset generator, cofactor not cleared
        note_contents.extend(self.asset_info.asset_type().asset_generator().to_bytes());

        // Writing the value in little endian
        (&mut note_contents)
            .write_u64::<LittleEndian>(self.value)
            .unwrap();

        // Write g_d
        note_contents.extend_from_slice(
            &self
                .asset_info
                .public_address()
                .diversifier_point
                .to_bytes(),
        );

        // Write pk_d
        note_contents
            .extend_from_slice(&self.asset_info.public_address().transmission_key.to_bytes());

        assert_eq!(note_contents.len(), 32 + 32 + 32 + 8);

        // Compute the Pedersen hash of the note contents
        let hash_of_contents = pedersen_hash(
            Personalization::NoteCommitment,
            note_contents
                .into_iter()
                .flat_map(|byte| (0..8).map(move |i| ((byte >> i) & 1) == 1)),
        );

        // Compute final commitment
        (constants::NOTE_COMMITMENT_RANDOMNESS_GENERATOR * self.randomness) + hash_of_contents
    }
}
