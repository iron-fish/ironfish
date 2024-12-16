/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use crate::{
    errors::{IronfishError, IronfishErrorKind},
    keys::PUBLIC_ADDRESS_SIZE,
    util::str_to_array,
    PublicAddress,
};
use byteorder::{ReadBytesExt, WriteBytesExt};
use ironfish_jubjub::{ExtendedPoint, SubgroupPoint};
use ironfish_zkp::constants::{ASSET_ID_LENGTH, ASSET_ID_PERSONALIZATION, GH_FIRST_BLOCK};
use std::io;

use super::asset_identifier::AssetIdentifier;

pub const NAME_LENGTH: usize = 32;
pub const METADATA_LENGTH: usize = 96;
pub const ASSET_LENGTH: usize = NAME_LENGTH + PUBLIC_ADDRESS_SIZE + METADATA_LENGTH + 1;
pub const ID_LENGTH: usize = ASSET_ID_LENGTH;

/// Describes all the fields necessary for creating and transacting with an
/// asset on the Iron Fish network
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Asset {
    /// Name of the asset
    pub(crate) name: [u8; NAME_LENGTH],

    /// Metadata fields for the asset (ex. chain, network, token identifier)
    pub(crate) metadata: [u8; METADATA_LENGTH],

    /// The address of the account that created the asset. Has permissions to mint
    pub(crate) creator: PublicAddress,

    /// The random byte used to ensure we get a valid asset identifier
    pub(crate) nonce: u8,

    /// The byte representation of a blake2s hash of the asset info
    pub(crate) id: AssetIdentifier,
}

impl Asset {
    /// Create a new AssetType from a public address, name, chain, and network
    pub fn new(creator: PublicAddress, name: &str, metadata: &str) -> Result<Asset, IronfishError> {
        let trimmed_name = name.trim();
        if trimmed_name.is_empty() {
            return Err(IronfishError::new(IronfishErrorKind::InvalidData));
        }

        let name_bytes = str_to_array(trimmed_name);
        let metadata_bytes = str_to_array(metadata);

        let mut nonce = 0u8;
        loop {
            if let Ok(asset) = Asset::new_with_nonce(creator, name_bytes, metadata_bytes, nonce) {
                return Ok(asset);
            }
            nonce = nonce
                .checked_add(1)
                .ok_or_else(|| IronfishError::new(IronfishErrorKind::RandomnessError))?;
        }
    }

    pub fn new_with_nonce(
        creator: PublicAddress,
        name: [u8; NAME_LENGTH],
        metadata: [u8; METADATA_LENGTH],
        nonce: u8,
    ) -> Result<Asset, IronfishError> {
        // Create the potential asset identifier from the asset info
        let asset_id_hash = blake2s_simd::Params::new()
            .hash_length(ASSET_ID_LENGTH)
            .personal(ASSET_ID_PERSONALIZATION)
            .to_state()
            .update(GH_FIRST_BLOCK)
            .update(&creator.public_address())
            .update(&name)
            .update(&metadata)
            .update(std::slice::from_ref(&nonce))
            .finalize();

        // Try creating an asset identifier from this hash
        let asset_id = AssetIdentifier::new(asset_id_hash.as_array().to_owned())?;

        // If the asset id is valid, this asset is valid
        Ok(Asset {
            creator,
            name,
            metadata,
            nonce,
            id: asset_id,
        })
    }

    pub fn metadata(&self) -> &[u8] {
        &self.metadata
    }

    pub fn name(&self) -> &[u8] {
        &self.name
    }

    pub fn nonce(&self) -> u8 {
        self.nonce
    }

    pub fn creator(&self) -> [u8; PUBLIC_ADDRESS_SIZE] {
        self.creator.public_address()
    }

    pub fn id(&self) -> &AssetIdentifier {
        &self.id
    }

    pub fn asset_generator(&self) -> ExtendedPoint {
        self.id.asset_generator()
    }

    pub fn value_commitment_generator(&self) -> SubgroupPoint {
        self.id.value_commitment_generator()
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let creator = PublicAddress::read(&mut reader)?;

        let mut name = [0; NAME_LENGTH];
        reader.read_exact(&mut name[..])?;

        let mut metadata = [0; METADATA_LENGTH];
        reader.read_exact(&mut metadata[..])?;

        let nonce = reader.read_u8()?;

        Asset::new_with_nonce(creator, name, metadata, nonce)
    }

    pub fn read_unchecked<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let creator = PublicAddress::read_unchecked(&mut reader)?;

        let mut name = [0; NAME_LENGTH];
        reader.read_exact(&mut name[..])?;

        let mut metadata = [0; METADATA_LENGTH];
        reader.read_exact(&mut metadata[..])?;

        let nonce = reader.read_u8()?;

        Asset::new_with_nonce(creator, name, metadata, nonce)
    }

    /// Stow the bytes of this struct in the given writer.
    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        self.creator.write(&mut writer)?;
        writer.write_all(&self.name)?;
        writer.write_all(&self.metadata)?;
        writer.write_u8(self.nonce)?;

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use hex_literal::hex;

    use crate::{util::str_to_array, PublicAddress, SaplingKey};

    use super::{Asset, ASSET_LENGTH};

    #[test]
    fn test_asset_new() {
        let key = SaplingKey::generate_key();
        let creator = key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(creator, name, metadata).expect("can create an asset");

        assert_eq!(asset.creator, creator);
        assert_eq!(asset.name, str_to_array(name));
        assert_eq!(asset.metadata, str_to_array(metadata));
    }

    #[test]
    fn test_asset_name_must_be_set() {
        let key = SaplingKey::generate_key();
        let creator = key.public_address();
        let metadata = "";

        let bad_asset1 = Asset::new(creator, "", metadata);
        assert!(bad_asset1.is_err());

        let bad_asset2 = Asset::new(creator, "   ", metadata);
        assert!(bad_asset2.is_err());

        let good_asset = Asset::new(creator, "foo", metadata);
        assert!(good_asset.is_ok());
    }

    #[test]
    fn test_asset_new_with_nonce() {
        let public_address = [
            81, 229, 109, 20, 111, 174, 52, 91, 120, 215, 34, 107, 174, 123, 78, 102, 189, 188,
            226, 7, 173, 7, 76, 135, 130, 203, 71, 131, 62, 219, 240, 68,
        ];
        let creator = PublicAddress::new(&public_address).unwrap();

        let name = str_to_array("name");
        let metadata = str_to_array("{ 'token_identifier': '0x123' }");
        let nonce = 1;

        let asset =
            Asset::new_with_nonce(creator, name, metadata, nonce).expect("can create an asset");

        assert_eq!(asset.creator, creator);
        assert_eq!(asset.name, name);
        assert_eq!(asset.metadata, metadata);
    }

    #[test]
    fn test_asset_new_with_nonce_invalid_nonce() {
        let nonce = 7;
        let public_address = [
            81, 229, 109, 20, 111, 174, 52, 91, 120, 215, 34, 107, 174, 123, 78, 102, 189, 188,
            226, 7, 173, 7, 76, 135, 130, 203, 71, 131, 62, 219, 240, 68,
        ];
        let creator = PublicAddress::new(&public_address).unwrap();

        let name = str_to_array("name");
        let metadata = str_to_array("{ 'token_identifier': '0x123' }");

        let asset_res = Asset::new_with_nonce(creator, name, metadata, nonce);

        assert!(asset_res.is_err());
    }

    #[test]
    fn test_serialization() {
        let creator_address =
            hex!("51e56d146fae345b78d7226bae7b4e66bdbce207ad074c8782cb47833edbf044");
        let creator = PublicAddress::new(&creator_address).unwrap();

        let nonce = 0;
        let name = str_to_array("name");
        let metadata = str_to_array("{ 'token_identifier': '0x123' }");

        let asset = Asset::new_with_nonce(creator, name, metadata, nonce).unwrap();

        let mut buf = Vec::new();
        asset.write(&mut buf).unwrap();

        assert_eq!(
            buf,
            hex!(
                // creator
                "51e56d146fae345b78d7226bae7b4e66bdbce207ad074c8782cb47833edbf044"
                // name
                "6e616d6500000000000000000000000000000000000000000000000000000000"
                // metadata
                "7b2027746f6b656e5f6964656e746966696572273a2027307831323327207d00"
                "0000000000000000000000000000000000000000000000000000000000000000"
                "0000000000000000000000000000000000000000000000000000000000000000"
                // nonce
                "00"
            )
        );

        assert_eq!(buf.len(), ASSET_LENGTH);

        let deserialized = Asset::read(&buf[..]).unwrap();
        assert_eq!(asset, deserialized);
    }
}
