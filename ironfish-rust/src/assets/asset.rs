use crate::{
    assets::constants::{ASSET_IDENTIFIER_LENGTH, ASSET_IDENTIFIER_PERSONALIZATION},
    errors::IronfishError,
    PublicAddress,
};
use blake2s_simd::Params as Blake2sParams;
use group::{cofactor::CofactorGroup, Group, GroupEncoding};
use ironfish_zkp::constants::{GH_FIRST_BLOCK, VALUE_COMMITMENT_GENERATOR_PERSONALIZATION};
use std::slice::from_ref;

#[allow(dead_code)]
pub type AssetIdentifier = [u8; ASSET_IDENTIFIER_LENGTH];

/// Describes all the fields necessary for creating and transacting with an
/// asset on the Iron Fish network
#[allow(dead_code)]
pub struct Asset {
    /// Name of the asset
    name: [u8; 32],

    /// Chain on the network the asset originated from (ex. Ropsten)
    chain: [u8; 32],

    /// Network the asset originated from (ex. Ethereum)
    network: [u8; 32],

    /// The owner who created the asset. Has permissions to mint
    owner: PublicAddress,

    /// The random byte used to ensure we get a valid asset identifier
    nonce: u8,

    /// Unique byte array which is a hash of all of the identifying fields for
    /// an asset
    identifier: AssetIdentifier,
}

impl Asset {
    /// Create a new AssetType from a public address, name, chain, and network
    #[allow(dead_code)]
    pub fn new(
        owner: PublicAddress,
        name: &str,
        chain: &str,
        network: &str,
    ) -> Result<Asset, IronfishError> {
        let mut name_bytes = [0; 32];
        let name_len = std::cmp::min(name.len(), 32);
        name_bytes[..name_len].clone_from_slice(&name.as_bytes()[..name_len]);

        let mut chain_bytes = [0; 32];
        let chain_len = std::cmp::min(chain.len(), 32);
        chain_bytes[..chain_len].clone_from_slice(&chain.as_bytes()[..chain_len]);

        let mut network_bytes = [0; 32];
        let network_len = std::cmp::min(network.len(), 32);
        network_bytes[..network_len].clone_from_slice(&network.as_bytes()[..network_len]);

        let mut nonce = 0u8;
        loop {
            if let Ok(asset_info) =
                Asset::new_with_nonce(owner, name_bytes, chain_bytes, network_bytes, nonce)
            {
                return Ok(asset_info);
            }

            nonce = nonce.checked_add(1).ok_or(IronfishError::RandomnessError)?;
        }
    }

    #[allow(dead_code)]
    fn new_with_nonce(
        owner: PublicAddress,
        name: [u8; 32],
        chain: [u8; 32],
        network: [u8; 32],
        nonce: u8,
    ) -> Result<Asset, IronfishError> {
        // Check the personalization is acceptable length
        assert_eq!(ASSET_IDENTIFIER_PERSONALIZATION.len(), 8);

        // Create a new BLAKE2s state for deriving the asset identifier
        let h = Blake2sParams::new()
            .hash_length(ASSET_IDENTIFIER_LENGTH)
            .personal(ASSET_IDENTIFIER_PERSONALIZATION)
            .to_state()
            .update(GH_FIRST_BLOCK)
            .update(&name)
            .update(&owner.public_address())
            .update(from_ref(&nonce))
            .finalize();

        // If the hash state is a valid asset identifier, use it
        if Self::hash_to_point(h.as_array()).is_some() {
            Ok(Asset {
                owner,
                name,
                chain,
                network,
                nonce,
                identifier: *h.as_array(),
            })
        } else {
            Err(IronfishError::InvalidAssetIdentifier)
        }
    }

    #[allow(dead_code)]
    fn hash_to_point(identifier: &AssetIdentifier) -> Option<jubjub::ExtendedPoint> {
        // Check the personalization is acceptable length
        assert_eq!(VALUE_COMMITMENT_GENERATOR_PERSONALIZATION.len(), 8);

        // Check to see that scalar field is 255 bits
        use ff::PrimeField;
        assert_eq!(bls12_381::Scalar::NUM_BITS, 255);

        // TODO: Is it correct that this uses VALUE_COMMITMENT_GENERATOR_PERSONALIZATION?
        // Should this use it's own personalization? Is this only used for this? Should
        // it be named something else, then?
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

    #[allow(dead_code)]
    pub fn name(&self) -> &[u8] {
        &self.name
    }

    #[allow(dead_code)]
    pub fn public_address(&self) -> &PublicAddress {
        &self.owner
    }

    #[allow(dead_code)]
    pub fn nonce(&self) -> &u8 {
        &self.nonce
    }

    #[allow(dead_code)]
    pub fn identifier(&self) -> &AssetIdentifier {
        &self.identifier
    }
}
