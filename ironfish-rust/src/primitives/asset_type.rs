// Credit to https://github.com/anoma/masp for providing the initial implementation of this file

use blake2s_simd::Params as Blake2sParams;
use group::{cofactor::CofactorGroup, Group, GroupEncoding};
use zcash_primitives::constants::{GH_FIRST_BLOCK, VALUE_COMMITMENT_GENERATOR_PERSONALIZATION};

use crate::{errors::AssetError, primitives::constants::ASSET_IDENTIFIER_PERSONALIZATION};

use super::{constants::ASSET_IDENTIFIER_LENGTH, sapling::ValueCommitment};

lazy_static! {
    pub static ref DEFAULT_ASSET: AssetType = AssetType::new(b"").unwrap();
}

#[derive(Copy, Clone, Debug)]
pub struct AssetType {
    identifier: [u8; ASSET_IDENTIFIER_LENGTH], // 32 byte asset type preimage
    nonce: Option<u8>,
}

// Abstract type representing an asset
impl AssetType {
    /// Return the default asset type
    pub fn default() -> AssetType {
        *DEFAULT_ASSET
    }

    /// Create a new AssetType from a unique asset name
    /// Not constant-time, uses rejection sampling
    pub fn new(name: &[u8]) -> Result<AssetType, AssetError> {
        let mut nonce = 0u8;
        loop {
            if let Some(asset_type) = AssetType::new_with_nonce(name, nonce) {
                return Ok(asset_type);
            }
            nonce = nonce.checked_add(1).ok_or(AssetError::RandomnessError)?;
        }
    }

    /// Attempt to create a new AssetType from a unique asset name and fixed nonce
    /// Not yet constant-time; assume not-constant-time
    pub fn new_with_nonce(name: &[u8], nonce: u8) -> Option<AssetType> {
        use std::slice::from_ref;

        // Check the personalization is acceptable length
        assert_eq!(ASSET_IDENTIFIER_PERSONALIZATION.len(), 8);

        // Create a new BLAKE2s state for deriving the asset identifier
        let h = Blake2sParams::new()
            .hash_length(ASSET_IDENTIFIER_LENGTH)
            .personal(ASSET_IDENTIFIER_PERSONALIZATION)
            .to_state()
            .update(GH_FIRST_BLOCK)
            .update(name)
            .update(from_ref(&nonce))
            .finalize();

        // If the hash state is a valid asset identifier, use it
        if AssetType::hash_to_point(h.as_array()).is_some() {
            Some(AssetType {
                identifier: *h.as_array(),
                nonce: Some(nonce),
            })
        } else {
            None
        }
    }

    // Attempt to hash an identifier to a curve point
    fn hash_to_point(identifier: &[u8; ASSET_IDENTIFIER_LENGTH]) -> Option<jubjub::ExtendedPoint> {
        // Check the personalization is acceptable length
        assert_eq!(VALUE_COMMITMENT_GENERATOR_PERSONALIZATION.len(), 8);

        // Check to see that scalar field is 255 bits
        use ff::PrimeField;
        assert_eq!(bls12_381::Scalar::NUM_BITS, 255);

        let h = Blake2sParams::new()
            .hash_length(32)
            .personal(VALUE_COMMITMENT_GENERATOR_PERSONALIZATION)
            .to_state()
            .update(identifier)
            .finalize();

        // Check to see if the BLAKE2s hash of the identifier is on the curve
        let p = jubjub::ExtendedPoint::from_bytes(h.as_array());
        if p.is_some().into() {
            // <ExtendedPoint as CofactorGroup>::clear_cofactor is implemented using
            // ExtendedPoint::mul_by_cofactor in the jubjub crate.
            let p = p.unwrap();
            let p_prime = CofactorGroup::clear_cofactor(&p);

            if p_prime.is_identity().into() {
                None
            } else {
                // If not small order, return *without* clearing the cofactor
                Some(p)
            }
        } else {
            None // invalid asset identifier
        }
    }

    /// Return the identifier of this asset type
    pub fn get_identifier(&self) -> &[u8; ASSET_IDENTIFIER_LENGTH] {
        &self.identifier
    }

    /// Attempt to construct an asset type from an existing asset identifier
    pub fn from_identifier(identifier: &[u8; ASSET_IDENTIFIER_LENGTH]) -> Option<AssetType> {
        // Attempt to hash to point
        if AssetType::hash_to_point(identifier).is_some() {
            Some(AssetType {
                identifier: *identifier,
                nonce: None,
            })
        } else {
            None // invalid asset identifier
        }
    }

    /// Produces an asset generator without cofactor cleared
    pub fn asset_generator(&self) -> jubjub::ExtendedPoint {
        AssetType::hash_to_point(self.get_identifier())
            .expect("AssetType internal identifier state inconsistent")
    }

    /// Produces a value commitment generator with cofactor cleared
    pub fn value_commitment_generator(&self) -> jubjub::SubgroupPoint {
        CofactorGroup::clear_cofactor(&self.asset_generator())
    }

    /// Construct a value commitment from given value and randomness
    pub fn value_commitment(&self, value: u64, randomness: jubjub::Fr) -> ValueCommitment {
        ValueCommitment {
            generator: self.value_commitment_generator(),
            value,
            randomness,
        }
    }

    pub fn get_nonce(&self) -> Option<u8> {
        self.nonce
    }
}

impl PartialEq for AssetType {
    fn eq(&self, other: &Self) -> bool {
        self.get_identifier() == other.get_identifier()
    }
}
