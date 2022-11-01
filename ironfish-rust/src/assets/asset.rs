/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use crate::{
    errors::IronfishError,
    util::str_to_array,
    PublicAddress,
};
use ironfish_zkp::{constants::{ASSET_IDENTIFIER_LENGTH, ASSET_IDENTIFIER_PERSONALIZATION, VALUE_COMMITMENT_GENERATOR_PERSONALIZATION}, group_hash};
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
        let name_bytes = str_to_array(name);
        let chain_bytes = str_to_array(chain);
        let network_bytes = str_to_array(network);

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
        let h = blake2s_simd::Params::new()
            .hash_length(ASSET_IDENTIFIER_LENGTH)
            .personal(ASSET_IDENTIFIER_PERSONALIZATION)
            .to_state()
            .update(&owner.public_address())
            .update(&name)
            .update(&chain)
            .update(&network)
            .update(from_ref(&nonce))
            .finalize();

        // Check that this is valid as a value commitment generator point
        if group_hash(h.as_bytes(), VALUE_COMMITMENT_GENERATOR_PERSONALIZATION).is_some() {
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

#[cfg(test)]
mod test {
    use crate::{util::str_to_array, PublicAddress, SaplingKey};

    use super::Asset;

    #[test]
    fn test_new_with_nonce() {
        let owner = PublicAddress::new(&[
            19, 26, 159, 204, 98, 253, 225, 73, 168, 125, 3, 240, 3, 129, 255, 146, 50, 134, 44,
            84, 181, 195, 50, 249, 78, 128, 228, 152, 239, 10, 106, 10, 27, 58, 155, 162, 114, 133,
            17, 48, 177, 29, 72,
        ])
        .expect("can create a deterministic public address");
        let name = str_to_array("name");
        let chain = str_to_array("chain");
        let network = str_to_array("network");
        let nonce = 0;

        let asset =
            Asset::new_with_nonce(owner, name, chain, network, nonce).expect("can create an asset");

        assert_eq!(asset.owner, owner);
        assert_eq!(asset.name, name);
        assert_eq!(asset.chain, chain);
        assert_eq!(asset.network, network);
        assert_eq!(asset.nonce, nonce);
        assert_eq!(
            asset.identifier,
            [
                63, 153, 26, 142, 149, 219, 17, 209, 253, 181, 149, 15, 213, 51, 143, 78, 12, 60,
                164, 140, 4, 112, 88, 247, 113, 83, 236, 214, 242, 91, 103, 175
            ]
        );
    }

    #[test]
    fn test_new() {
        let key = SaplingKey::generate_key();
        let owner = key.generate_public_address();
        let name = "name";
        let chain = "chain";
        let network = "network";

        let asset = Asset::new(owner, name, chain, network).expect("can create an asset");

        assert_eq!(asset.owner, owner);
        assert_eq!(asset.name, str_to_array(name));
        assert_eq!(asset.chain, str_to_array(chain));
        assert_eq!(asset.network, str_to_array(network));
    }
}
