/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use crate::errors::IronfishError;
use group::cofactor::CofactorGroup;
use ironfish_zkp::{
    constants::{ASSET_ID_LENGTH, VALUE_COMMITMENT_VALUE_GENERATOR},
    util::asset_hash_to_point,
};
use jubjub::{ExtendedPoint, SubgroupPoint};
use std::io;

pub const NATIVE_ASSET: AssetIdentifier = AssetIdentifier([
    215, 200, 103, 6, 245, 129, 122, 167, 24, 205, 28, 250, 208, 50, 51, 188, 214, 74, 119, 137,
    253, 148, 34, 211, 177, 122, 246, 130, 58, 126, 106, 198,
]);

// Uses the original value commitment generator as the native asset generator
pub const NATIVE_ASSET_GENERATOR: SubgroupPoint = VALUE_COMMITMENT_VALUE_GENERATOR;

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

        Err(IronfishError::InvalidAssetIdentifier)
    }
}

#[cfg(test)]
mod test {
    use group::GroupEncoding;
    use ironfish_zkp::constants::VALUE_COMMITMENT_VALUE_GENERATOR;

    use crate::assets::{asset::NATIVE_ASSET_GENERATOR, asset_identifier::NATIVE_ASSET};

    #[test]
    fn test_asset_native_identifier() {
        // Native asset uses the original value commitment generator, no
        // particular reason other than it is easier to think about this way.
        // TODO: This is not right anymore, to be fixed soon.
        assert_eq!(NATIVE_ASSET.0, VALUE_COMMITMENT_VALUE_GENERATOR.to_bytes());
        assert_eq!(NATIVE_ASSET.0, NATIVE_ASSET_GENERATOR.to_bytes());
    }
}
