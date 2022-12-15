/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::io;
use anyhow::{anyhow, Error};
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use ff::Field;
use group::GroupEncoding;
use ironfish_zkp::{constants::ASSET_IDENTIFIER_LENGTH, ValueCommitment};
use jubjub::ExtendedPoint;
use rand::thread_rng;

use crate::{
    assets::asset::{asset_generator_from_identifier, AssetIdentifier},
    errors::IronfishError,
    serializing::read_point,
};

/// Parameters used to build a burn description
pub struct BurnBuilder {
    /// Identifier of the Asset to be burned
    pub asset_identifier: AssetIdentifier,

    /// Commitment to represent the value. Even though the value of the burn is
    /// public, we still need the commitment to balance the transaction
    pub value_commitment: ValueCommitment,
}

impl BurnBuilder {
    pub fn new(asset_identifier: AssetIdentifier, value: u64) -> Self {
        let asset_generator = asset_generator_from_identifier(&asset_identifier);

        let value_commitment = ValueCommitment {
            value,
            randomness: jubjub::Fr::random(thread_rng()),
            asset_generator,
        };

        Self {
            asset_identifier,
            value_commitment,
        }
    }

    /// Get the value_commitment from this proof as an Edwards Point.
    ///
    /// This integrates the value and randomness into a single point, using an
    /// appropriate generator.
    pub fn value_commitment_point(&self) -> ExtendedPoint {
        ExtendedPoint::from(self.value_commitment.commitment())
    }

    pub fn build(&self) -> BurnDescription {
        BurnDescription {
            asset_identifier: self.asset_identifier,
            value: self.value_commitment.value,
            value_commitment: self.value_commitment_point(),
        }
    }
}

/// This description represents an action to decrease the supply of an existing
/// asset on Iron Fish
#[derive(Clone)]
pub struct BurnDescription {
    /// Identifier for the Asset which is being burned
    pub asset_identifier: AssetIdentifier,

    /// Amount of asset to burn
    pub value: u64,

    /// Randomized commitment to represent the value being burned in this proof
    /// needed to balance the transaction.
    pub value_commitment: ExtendedPoint,
}

impl BurnDescription {
    pub fn verify_not_small_order(&self) -> Result<(), Error> {
        if self.value_commitment.is_small_order().into() {
            return Err(anyhow!(IronfishError::IsSmallOrder));
        }

        Ok(())
    }

    /// Write the signature of this proof to the provided writer.
    ///
    /// The signature is used by the transaction to calculate the signature
    /// hash. Having this data essentially binds the note to the transaction,
    /// proving that it is actually part of that transaction.
    pub(crate) fn serialize_signature_fields<W: io::Write>(
        &self,
        mut writer: W,
    ) -> Result<(), Error> {
        writer.write_all(&self.asset_identifier)?;
        writer.write_u64::<LittleEndian>(self.value)?;
        writer.write_all(&self.value_commitment.to_bytes())?;

        Ok(())
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, Error> {
        let asset_identifier = {
            let mut bytes = [0u8; ASSET_IDENTIFIER_LENGTH];
            reader.read_exact(&mut bytes)?;
            bytes
        };
        let value = reader.read_u64::<LittleEndian>()?;
        let value_commitment = read_point(&mut reader)?;

        Ok(BurnDescription {
            asset_identifier,
            value,
            value_commitment,
        })
    }

    /// Stow the bytes of this [`BurnDescription`] in the given writer.
    pub fn write<W: io::Write>(&self, writer: W) -> Result<(), Error> {
        self.serialize_signature_fields(writer)?;

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use crate::{assets::asset::Asset, transaction::burns::BurnDescription, SaplingKey};

    use super::BurnBuilder;

    #[test]
    fn test_burn_builder() {
        let key = SaplingKey::generate_key();
        let owner = key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(owner, name, metadata).unwrap();
        let value = 5;

        let builder = BurnBuilder::new(asset.identifier, value);
        let burn = builder.build();

        burn.verify_not_small_order()
            .expect("value commitment should not be small order");
    }

    #[test]
    fn test_burn_description_serialization() {
        let key = SaplingKey::generate_key();
        let owner = key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(owner, name, metadata).unwrap();
        let value = 5;

        let builder = BurnBuilder::new(asset.identifier, value);
        let burn = builder.build();

        let mut serialized_description = vec![];
        burn.write(&mut serialized_description)
            .expect("should be able to serialize description");

        let deserialized_description = BurnDescription::read(&serialized_description[..])
            .expect("should be able to deserialize valid description");

        assert_eq!(
            burn.asset_identifier,
            deserialized_description.asset_identifier
        );
        assert_eq!(burn.value, deserialized_description.value);
        assert_eq!(
            burn.value_commitment,
            deserialized_description.value_commitment
        );

        let mut reserialized_description = vec![];
        deserialized_description
            .write(&mut reserialized_description)
            .expect("should be able to serialize proof again");

        assert_eq!(serialized_description, reserialized_description);
    }
}
