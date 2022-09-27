use blake2s_simd::Params as Blake2sParams;
use bls12_381::Scalar;
use byteorder::{LittleEndian, WriteBytesExt};
use group::{Curve, GroupEncoding};
use rand::{thread_rng, Rng};
use zcash_primitives::{
    constants::{self},
    pedersen_hash::{pedersen_hash, Personalization},
    primitives::Nullifier,
};

use crate::{
    primitives::{asset_type::AssetInfo, sapling::ValueCommitment},
    AssetType, PublicAddress,
};

use super::spendable_note::{NoteTrait, NoteType, SpendableNote};

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

impl SpendableNote for MintAssetNote {
    fn nullifier(&self, spender_key: &crate::SaplingKey, witness_position: u64) -> Nullifier {
        // TODO: Make this a helper fn somewhere so we aren't duplicating code?
        // Compute rho = cm + position.G
        let rho = self.commitment_full_point()
            + (constants::NULLIFIER_POSITION_GENERATOR * jubjub::Fr::from(witness_position));

        // Compute nf = BLAKE2s(nk | rho)
        Nullifier::from_slice(
            Blake2sParams::new()
                .hash_length(32)
                .personal(constants::PRF_NF_PERSONALIZATION)
                .to_state()
                .update(&spender_key.sapling_viewing_key().nk.to_bytes())
                .update(&rho.to_bytes())
                .finalize()
                .as_bytes(),
        )
        .unwrap()
    }

    fn value(&self) -> u64 {
        self.value
    }

    fn value_commitment(&self) -> ValueCommitment {
        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);

        self.asset_type()
            .value_commitment(self.value, jubjub::Fr::from_bytes_wide(&buffer))
    }
}

impl NoteTrait for MintAssetNote {
    fn note_type(&self) -> NoteType {
        NoteType::MintAsset
    }

    fn commitment_point(&self) -> Scalar {
        jubjub::ExtendedPoint::from(self.commitment_full_point())
            .to_affine()
            .get_u()
    }

    fn asset_type(&self) -> AssetType {
        self.asset_info.asset_type()
    }

    fn owner(&self) -> PublicAddress {
        self.asset_info.public_address()
    }

    fn randomness(&self) -> jubjub::Fr {
        self.randomness
    }
}
