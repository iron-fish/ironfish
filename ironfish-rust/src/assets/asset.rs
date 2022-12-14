/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use crate::{errors::IronfishError, keys::PUBLIC_ADDRESS_SIZE, util::str_to_array, PublicAddress};
use bellman::gadgets::multipack;
use byteorder::{ReadBytesExt, WriteBytesExt};
use group::GroupEncoding;
use ironfish_zkp::{
    constants::{
        ASSET_IDENTIFIER_LENGTH, ASSET_IDENTIFIER_PERSONALIZATION,
        VALUE_COMMITMENT_GENERATOR_PERSONALIZATION, VALUE_COMMITMENT_VALUE_GENERATOR,
    },
    group_hash, pedersen_hash,
};
use jubjub::SubgroupPoint;
use std::{io, slice::from_ref};

pub const NATIVE_ASSET: AssetIdentifier = [
    215, 200, 103, 6, 245, 129, 122, 167, 24, 205, 28, 250, 208, 50, 51, 188, 214, 74, 119, 137,
    253, 148, 34, 211, 177, 122, 246, 130, 58, 126, 106, 198,
];

// Uses the original value commitment generator as the native asset generator
pub const NATIVE_ASSET_GENERATOR: SubgroupPoint = VALUE_COMMITMENT_VALUE_GENERATOR;

pub const NAME_LENGTH: usize = 32;
const ASSET_INFO_HASHED_LENGTH: usize = 32;
pub const METADATA_LENGTH: usize = 76;
pub const ASSET_LENGTH: usize = NAME_LENGTH + PUBLIC_ADDRESS_SIZE + METADATA_LENGTH + 1;
pub const IDENTIFIER_LENGTH: usize = ASSET_IDENTIFIER_LENGTH;

pub type AssetIdentifier = [u8; ASSET_IDENTIFIER_LENGTH];

/// Describes all the fields necessary for creating and transacting with an
/// asset on the Iron Fish network
#[derive(Clone, Copy)]
pub struct Asset {
    /// Name of the asset
    pub(crate) name: [u8; NAME_LENGTH],

    /// Metadata fields for the asset (ex. chain, network, token identifier)
    pub(crate) metadata: [u8; METADATA_LENGTH],

    /// The owner who created the asset. Has permissions to mint
    pub(crate) owner: PublicAddress,

    /// The random byte used to ensure we get a valid asset identifier
    pub(crate) nonce: u8,

    /// The pedersen-hash of the asset info plaintext (name, metadata, owner, nonce)
    pub(crate) asset_info_hashed: [u8; ASSET_INFO_HASHED_LENGTH],

    /// The byte representation of the generator point derived from the hashed asset info
    pub(crate) identifier: AssetIdentifier,
}

impl Asset {
    /// Create a new AssetType from a public address, name, chain, and network
    pub fn new(owner: PublicAddress, name: &str, metadata: &str) -> Result<Asset, IronfishError> {
        let trimmed_name = name.trim();
        if trimmed_name.is_empty() {
            return Err(IronfishError::InvalidData);
        }

        let name_bytes = str_to_array(trimmed_name);
        let metadata_bytes = str_to_array(metadata);

        let mut nonce = 0u8;
        loop {
            if let Ok(asset_info) = Asset::new_with_nonce(owner, name_bytes, metadata_bytes, nonce)
            {
                return Ok(asset_info);
            }

            nonce = nonce.checked_add(1).ok_or(IronfishError::RandomnessError)?;
        }
    }

    fn new_with_nonce(
        owner: PublicAddress,
        name: [u8; NAME_LENGTH],
        metadata: [u8; METADATA_LENGTH],
        nonce: u8,
    ) -> Result<Asset, IronfishError> {
        let capacity = METADATA_LENGTH + NAME_LENGTH + PUBLIC_ADDRESS_SIZE + 1;
        let mut preimage = Vec::with_capacity(capacity);
        preimage.extend(owner.public_address());
        preimage.extend(name);
        preimage.extend(metadata);
        preimage.extend(from_ref(&nonce));

        if preimage.len() != capacity {
            return Err(IronfishError::InvalidData);
        }

        let preimage_bits = multipack::bytes_to_bits_le(&preimage);

        let asset_info_hashed_point =
            pedersen_hash::pedersen_hash(ASSET_IDENTIFIER_PERSONALIZATION, preimage_bits);

        let asset_info_hashed = asset_info_hashed_point.to_bytes();

        // Check that this is valid as a value commitment generator point
        if let Ok(generator_point) = asset_generator_point(&asset_info_hashed) {
            Ok(Asset {
                owner,
                name,
                metadata,
                nonce,
                asset_info_hashed,
                identifier: generator_point.to_bytes(),
            })
        } else {
            Err(IronfishError::InvalidAssetIdentifier)
        }
    }

    pub fn metadata(&self) -> &[u8] {
        &self.metadata
    }

    pub fn name(&self) -> &[u8] {
        &self.name
    }

    pub fn owner(&self) -> [u8; PUBLIC_ADDRESS_SIZE] {
        self.owner.public_address()
    }

    pub fn nonce(&self) -> &u8 {
        &self.nonce
    }

    pub fn identifier(&self) -> &AssetIdentifier {
        &self.identifier
    }

    pub fn generator(&self) -> SubgroupPoint {
        SubgroupPoint::from_bytes(&self.identifier).unwrap()
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let owner = PublicAddress::read(&mut reader)?;

        let mut name = [0; NAME_LENGTH];
        reader.read_exact(&mut name[..])?;

        let mut metadata = [0; METADATA_LENGTH];
        reader.read_exact(&mut metadata[..])?;

        let nonce = reader.read_u8()?;

        Asset::new_with_nonce(owner, name, metadata, nonce)
    }

    /// Stow the bytes of this [`MintDescription`] in the given writer.
    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        self.owner.write(&mut writer)?;
        writer.write_all(&self.name)?;
        writer.write_all(&self.metadata)?;
        writer.write_u8(self.nonce)?;

        Ok(())
    }
}

pub fn asset_generator_point(
    asset_info_hashed: &[u8; ASSET_INFO_HASHED_LENGTH],
) -> Result<SubgroupPoint, IronfishError> {
    group_hash(
        asset_info_hashed,
        VALUE_COMMITMENT_GENERATOR_PERSONALIZATION,
    )
    .ok_or(IronfishError::InvalidAssetIdentifier)
}

pub fn asset_generator_from_identifier(asset_identifier: &AssetIdentifier) -> SubgroupPoint {
    SubgroupPoint::from_bytes(asset_identifier).unwrap()
}

#[cfg(test)]
mod test {
    use group::GroupEncoding;
    use ironfish_zkp::constants::VALUE_COMMITMENT_VALUE_GENERATOR;

    use crate::{util::str_to_array, PublicAddress, SaplingKey};

    use super::{Asset, NATIVE_ASSET};

    #[test]
    fn test_asset_name_must_be_set() {
        let key = SaplingKey::generate_key();
        let owner = key.public_address();
        let metadata = "";

        let bad_asset1 = Asset::new(owner, "", metadata);
        assert!(bad_asset1.is_err());

        let bad_asset2 = Asset::new(owner, "   ", metadata);
        assert!(bad_asset2.is_err());

        let good_asset = Asset::new(owner, "foo", metadata);
        assert!(good_asset.is_ok());
    }

    #[test]
    fn test_asset_new_with_nonce() {
        let public_address = [
            81, 229, 109, 20, 111, 174, 52, 91, 120, 215, 34, 107, 174, 123, 78, 102, 189, 188,
            226, 7, 173, 7, 76, 135, 130, 203, 71, 131, 62, 219, 240, 68,
        ];
        let owner = PublicAddress::new(&public_address).unwrap();

        let name = str_to_array("name");
        let metadata = str_to_array("{ 'token_identifier': '0x123' }");
        let nonce = 0;

        let asset =
            Asset::new_with_nonce(owner, name, metadata, nonce).expect("can create an asset");

        assert_eq!(asset.owner, owner);
        assert_eq!(asset.name, name);
        assert_eq!(asset.metadata, metadata);
        assert_eq!(asset.nonce, nonce);
        assert_eq!(
            asset.asset_info_hashed,
            [
                93, 235, 106, 80, 26, 7, 144, 60, 214, 120, 222, 12, 248, 203, 133, 3, 69, 97, 251,
                152, 71, 167, 244, 40, 235, 2, 115, 246, 188, 21, 5, 51
            ]
        );
    }

    #[test]
    fn test_asset_new() {
        let key = SaplingKey::generate_key();
        let owner = key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(owner, name, metadata).expect("can create an asset");

        assert_eq!(asset.owner, owner);
        assert_eq!(asset.name, str_to_array(name));
        assert_eq!(asset.metadata, str_to_array(metadata));
    }

    #[test]
    fn test_asset_native_identifier() {
        // Native asset uses the original value commitment generator, no
        // particular reason other than it is easier to think about this way.
        assert_eq!(NATIVE_ASSET, VALUE_COMMITMENT_VALUE_GENERATOR.to_bytes());
    }
}
