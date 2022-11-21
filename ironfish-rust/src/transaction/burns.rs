/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::io;

use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use ff::Field;
use group::GroupEncoding;
use ironfish_zkp::ValueCommitment;
use jubjub::ExtendedPoint;
use rand::thread_rng;

use crate::{
    assets::asset::{asset_generator_point, Asset},
    errors::IronfishError,
};

/// Parameters used to build a burn description
pub struct BurnBuilder {
    /// Asset to be burned
    pub asset: Asset,

    /// Commitment to represent the value. Even though the value of the burn is
    /// public, we still need the commitment to balance the transaction
    pub value_commitment: ValueCommitment,
}

impl BurnBuilder {
    pub fn new(asset: Asset, value: u64) -> Self {
        let value_commitment = ValueCommitment {
            value,
            randomness: jubjub::Fr::random(thread_rng()),
            asset_generator: asset_generator_point(asset.identifier()).unwrap(),
        };

        Self {
            asset,
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
            asset: self.asset,
            value: self.value_commitment.value,
            value_commitment: self.value_commitment_point(),
        }
    }
}

/// This description represents an action to decrease the supply of an existing
/// asset on Iron Fish
#[derive(Clone)]
pub struct BurnDescription {
    /// Asset which is being burned
    pub asset: Asset,

    /// Amount of asset to burn
    pub value: u64,

    /// Randomized commitment to represent the value being burned in this proof
    /// needed to balance the transaction.
    pub value_commitment: ExtendedPoint,
}

impl BurnDescription {
    pub fn new(asset: Asset, value: u64) -> Self {
        let value_commitment = ValueCommitment {
            value,
            randomness: jubjub::Fr::random(thread_rng()),
            asset_generator: asset_generator_point(asset.identifier()).unwrap(),
        };

        Self {
            asset,
            value,
            value_commitment: value_commitment.commitment().into(),
        }
    }

    pub fn verify_not_small_order(&self) -> Result<(), IronfishError> {
        if self.value_commitment.is_small_order().into() {
            return Err(IronfishError::IsSmallOrder);
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
    ) -> Result<(), IronfishError> {
        self.asset.write(&mut writer)?;
        writer.write_u64::<LittleEndian>(self.value)?;
        writer.write_all(&self.value_commitment.to_bytes())?;

        Ok(())
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let asset = Asset::read(&mut reader)?;
        let value = reader.read_u64::<LittleEndian>()?;

        let value_commitment = {
            let mut bytes = [0; 32];
            reader.read_exact(&mut bytes)?;

            Option::from(ExtendedPoint::from_bytes(&bytes)).ok_or(IronfishError::InvalidData)?
        };

        Ok(BurnDescription {
            asset,
            value,
            value_commitment,
        })
    }

    /// Stow the bytes of this [`BurnDescription`] in the given writer.
    pub fn write<W: io::Write>(&self, writer: W) -> Result<(), IronfishError> {
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
        let owner = key.asset_public_key();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(owner, name, metadata).unwrap();
        let value = 5;

        let builder = BurnBuilder::new(asset, value);
        let burn = builder.build();

        burn.verify_not_small_order()
            .expect("value commitment should not be small order");
    }

    #[test]
    fn test_burn_description_serialization() {
        let key = SaplingKey::generate_key();
        let owner = key.asset_public_key();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(owner, name, metadata).unwrap();
        let value = 5;

        let burn = BurnDescription::new(asset, value);

        let mut serialized_description = vec![];
        burn.write(&mut serialized_description)
            .expect("should be able to serialize description");

        let deserialized_description = BurnDescription::read(&serialized_description[..])
            .expect("should be able to deserialize valid description");

        assert_eq!(
            burn.asset.identifier(),
            deserialized_description.asset.identifier()
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
