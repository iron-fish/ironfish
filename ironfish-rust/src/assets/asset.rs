/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use crate::{
    assets::constants::{ASSET_IDENTIFIER_LENGTH, ASSET_IDENTIFIER_PERSONALIZATION},
    errors::IronfishError,
    util::str_to_array,
    PublicAddress,
};
use blake2s_simd::Params as Blake2sParams;
use ironfish_zkp::{constants::VALUE_COMMITMENT_GENERATOR_PERSONALIZATION, group_hash};
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
        let h = Blake2sParams::new()
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
