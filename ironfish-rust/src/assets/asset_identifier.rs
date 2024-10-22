/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use crate::errors::{IronfishError, IronfishErrorKind};
use group::cofactor::CofactorGroup;
use ironfish_jubjub::{ExtendedPoint, SubgroupPoint};
use ironfish_zkp::{constants::ASSET_ID_LENGTH, util::asset_hash_to_point};
use std::io;

pub const NATIVE_ASSET: AssetIdentifier = AssetIdentifier([
    81, 243, 58, 47, 20, 249, 39, 53, 229, 98, 220, 101, 138, 86, 57, 39, 157, 220, 163, 213, 7,
    154, 109, 18, 66, 178, 165, 136, 169, 203, 244, 76,
]);

/// A convenience wrapper around an asset id byte-array, allowing us to push the
/// error checking of the asset id validity to instantiation
/// instead of when trying to get the generator point. This causes code relating
/// to notes and value commitments to be a bit cleaner
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub struct AssetIdentifier([u8; ASSET_ID_LENGTH]);

impl AssetIdentifier {
    pub fn new(byte_array: [u8; 32]) -> Result<Self, IronfishError> {
        byte_array.try_into()
    }

    pub fn asset_generator(&self) -> ExtendedPoint {
        asset_hash_to_point(&self.0).unwrap()
    }

    pub fn value_commitment_generator(&self) -> SubgroupPoint {
        self.asset_generator().clear_cofactor()
    }

    pub fn as_bytes(&self) -> &[u8; ASSET_ID_LENGTH] {
        &self.0
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let mut bytes = [0u8; ASSET_ID_LENGTH];
        reader.read_exact(&mut bytes)?;
        bytes.try_into()
    }

    /// Stow the bytes of this struct in the given writer.
    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        writer.write_all(&self.0)?;

        Ok(())
    }
}

impl TryFrom<[u8; ASSET_ID_LENGTH]> for AssetIdentifier {
    type Error = IronfishError;

    fn try_from(byte_array: [u8; ASSET_ID_LENGTH]) -> Result<Self, Self::Error> {
        if asset_hash_to_point(&byte_array).is_some() {
            return Ok(Self(byte_array));
        }

        Err(IronfishError::new(
            IronfishErrorKind::InvalidAssetIdentifier,
        ))
    }
}

#[cfg(test)]
mod test {
    use group::cofactor::CofactorGroup;
    use ironfish_zkp::constants::NATIVE_VALUE_COMMITMENT_GENERATOR;

    use crate::assets::asset_identifier::NATIVE_ASSET;

    #[test]
    fn test_asset_native_identifier() {
        let asset_generator = NATIVE_ASSET.asset_generator();
        let value_commitment_generator = NATIVE_ASSET.value_commitment_generator();

        assert_eq!(asset_generator.clear_cofactor(), value_commitment_generator);

        assert_eq!(
            value_commitment_generator,
            *NATIVE_VALUE_COMMITMENT_GENERATOR
        );
    }
}
