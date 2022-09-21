use std::slice;

use bls12_381::Scalar;
use group::Curve;
use rand::{thread_rng, Rng};
use zcash_primitives::{
    constants::{GH_FIRST_BLOCK, NOTE_COMMITMENT_RANDOMNESS_GENERATOR},
    pedersen_hash,
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
    // TODO: carry over all? fns from Note
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

    pub fn commitment(&self) -> Scalar {
        let mut commitment_plaintext: Vec<u8> = vec![];
        commitment_plaintext.extend(GH_FIRST_BLOCK);
        commitment_plaintext.extend(self.asset_info.name());
        commitment_plaintext.extend(self.asset_info.public_address_bytes());
        commitment_plaintext.extend(slice::from_ref(self.asset_info.nonce()));

        // TODO: Make a helper function
        let commitment_hash = jubjub::ExtendedPoint::from(pedersen_hash::pedersen_hash(
            pedersen_hash::Personalization::NoteCommitment,
            commitment_plaintext
                .into_iter()
                .flat_map(|byte| (0..8).map(move |i| ((byte >> i) & 1) == 1)),
        ));

        let commitment_full_point =
            commitment_hash + (NOTE_COMMITMENT_RANDOMNESS_GENERATOR * self.randomness);

        commitment_full_point.to_affine().get_u()
    }
}
