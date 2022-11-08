/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use crate::{errors::IronfishError, util::str_to_array, PublicAddress};
use ironfish_zkp::{
    constants::{
        ASSET_IDENTIFIER_LENGTH, ASSET_IDENTIFIER_PERSONALIZATION,
        VALUE_COMMITMENT_GENERATOR_PERSONALIZATION,
    },
    group_hash,
};
use jubjub::SubgroupPoint;
use std::slice::from_ref;

#[allow(dead_code)]
pub type AssetIdentifier = [u8; ASSET_IDENTIFIER_LENGTH];

pub const NATIVE_ASSET: AssetIdentifier = [
    215, 200, 103, 6, 245, 129, 122, 167, 24, 205, 28, 250, 208, 50, 51, 188, 214, 74, 119, 137,
    253, 148, 34, 211, 177, 122, 246, 130, 58, 126, 106, 198,
];

/// Describes all the fields necessary for creating and transacting with an
/// asset on the Iron Fish network
#[allow(dead_code)]
#[derive(Clone, Copy)]
pub struct Asset {
    /// Name of the asset
    pub(crate) name: [u8; 32],

    /// Chain on the network the asset originated from (ex. Ropsten)
    pub(crate) chain: [u8; 32],

    /// Network the asset originated from (ex. Ethereum)
    pub(crate) network: [u8; 32],

    /// Identifier field for bridged asset address, or if a native custom asset, random bytes.
    pub(crate) token_identifier: [u8; 32],

    /// The owner who created the asset. Has permissions to mint
    pub(crate) owner: PublicAddress,

    /// The random byte used to ensure we get a valid asset identifier
    pub(crate) nonce: u8,

    /// Unique byte array which is a hash of all of the identifying fields for
    /// an asset
    pub(crate) identifier: AssetIdentifier,
}

impl Asset {
    /// Create a new AssetType from a public address, name, chain, and network
    #[allow(dead_code)]
    pub fn new(
        owner: PublicAddress,
        name: &str,
        chain: &str,
        network: &str,
        token_identifier: &str,
    ) -> Result<Asset, IronfishError> {
        let name_bytes = str_to_array(name);
        let chain_bytes = str_to_array(chain);
        let network_bytes = str_to_array(network);
        let token_identifier_bytes = str_to_array(token_identifier);

        let mut nonce = 0u8;
        loop {
            if let Ok(asset_info) = Asset::new_with_nonce(
                owner,
                name_bytes,
                chain_bytes,
                network_bytes,
                token_identifier_bytes,
                nonce,
            ) {
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
        token_identifier: [u8; 32],
        nonce: u8,
    ) -> Result<Asset, IronfishError> {
        // Check the personalization is acceptable length
        assert_eq!(ASSET_IDENTIFIER_PERSONALIZATION.len(), 8);

        // Create a new BLAKE2s state for deriving the asset identifier
        let h = blake2s_simd::Params::new()
            .hash_length(ASSET_IDENTIFIER_LENGTH)
            .personal(ASSET_IDENTIFIER_PERSONALIZATION)
            .to_state()
            .update(&owner.public_address())
            .update(&name)
            .update(&chain)
            .update(&network)
            .update(&token_identifier)
            .update(from_ref(&nonce))
            .finalize();

        // Check that this is valid as a value commitment generator point
        if asset_generator_point(h.as_array()).is_ok() {
            Ok(Asset {
                owner,
                name,
                chain,
                network,
                token_identifier,
                nonce,
                identifier: *h.as_array(),
            })
        } else {
            Err(IronfishError::InvalidAssetIdentifier)
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

pub fn asset_generator_point(asset: &AssetIdentifier) -> Result<SubgroupPoint, IronfishError> {
    group_hash(asset, VALUE_COMMITMENT_GENERATOR_PERSONALIZATION)
        .ok_or(IronfishError::InvalidAssetIdentifier)
}

#[cfg(test)]
mod test {
    use group::GroupEncoding;
    use ironfish_zkp::constants::VALUE_COMMITMENT_VALUE_GENERATOR;

    use crate::{util::str_to_array, PublicAddress, SaplingKey};

    use super::{Asset, NATIVE_ASSET};

    #[test]
    fn test_asset_new_with_nonce() {
        let owner = PublicAddress::new(&[
            19, 26, 159, 204, 98, 253, 225, 73, 168, 125, 3, 240, 3, 129, 255, 146, 50, 134, 44,
            84, 181, 195, 50, 249, 78, 128, 228, 152, 239, 10, 106, 10, 27, 58, 155, 162, 114, 133,
            17, 48, 177, 29, 72,
        ])
        .expect("can create a deterministic public address");
        let name = str_to_array("name");
        let chain = str_to_array("chain");
        let network = str_to_array("network");
        let token_identifier = str_to_array("token identifier");
        let nonce = 0;

        let asset = Asset::new_with_nonce(owner, name, chain, network, token_identifier, nonce)
            .expect("can create an asset");

        assert_eq!(asset.owner, owner);
        assert_eq!(asset.name, name);
        assert_eq!(asset.chain, chain);
        assert_eq!(asset.network, network);
        assert_eq!(asset.token_identifier, token_identifier);
        assert_eq!(asset.nonce, nonce);
        assert_eq!(
            asset.identifier,
            [
                174, 9, 19, 214, 96, 63, 10, 51, 94, 42, 41, 186, 207, 162, 48, 235, 1, 255, 211,
                190, 228, 93, 137, 120, 138, 89, 61, 168, 168, 11, 150, 127
            ],
        );
    }

    #[test]
    fn test_asset_new() {
        let key = SaplingKey::generate_key();
        let owner = key.generate_public_address();
        let name = "name";
        let chain = "chain";
        let network = "network";
        let token_identifier = "token identifier";

        let asset =
            Asset::new(owner, name, chain, network, token_identifier).expect("can create an asset");

        assert_eq!(asset.owner, owner);
        assert_eq!(asset.name, str_to_array(name));
        assert_eq!(asset.chain, str_to_array(chain));
        assert_eq!(asset.network, str_to_array(network));
        assert_eq!(asset.token_identifier, str_to_array(token_identifier));
    }

    #[test]
    fn test_asset_native_identifier() {
        // Native asset uses the original value commitment generator, no
        // particular reason other than it is easier to think about this way.
        assert_eq!(NATIVE_ASSET, VALUE_COMMITMENT_VALUE_GENERATOR.to_bytes());
    }
}
