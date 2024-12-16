/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::io;

use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};

use crate::{assets::asset_identifier::AssetIdentifier, errors::IronfishError};

/// Parameters used to build a burn description
pub struct BurnBuilder {
    /// Identifier of the Asset to be burned
    pub asset_id: AssetIdentifier,

    /// Amount of asset to burn
    pub value: u64,
}

impl BurnBuilder {
    pub fn new(asset_id: AssetIdentifier, value: u64) -> Self {
        Self { asset_id, value }
    }

    pub fn build(&self) -> BurnDescription {
        BurnDescription {
            asset_id: self.asset_id,
            value: self.value,
        }
    }
}

/// This description represents an action to decrease the supply of an existing
/// asset on Iron Fish
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct BurnDescription {
    /// Identifier for the Asset which is being burned
    pub asset_id: AssetIdentifier,

    /// Amount of asset to burn
    pub value: u64,
}

impl BurnDescription {
    /// Write the signature of this proof to the provided writer.
    ///
    /// The signature is used by the transaction to calculate the signature
    /// hash. Having this data essentially binds the note to the transaction,
    /// proving that it is actually part of that transaction.
    pub(crate) fn serialize_signature_fields<W: io::Write>(
        &self,
        mut writer: W,
    ) -> Result<(), IronfishError> {
        self.asset_id.write(&mut writer)?;
        writer.write_u64::<LittleEndian>(self.value)?;

        Ok(())
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let asset_id = AssetIdentifier::read(&mut reader)?;
        let value = reader.read_u64::<LittleEndian>()?;

        Ok(BurnDescription { asset_id, value })
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
        let creator = key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(creator, name, metadata).unwrap();
        let value = 5;

        let builder = BurnBuilder::new(asset.id, value);

        assert_eq!(builder.value, value);
        assert_eq!(builder.asset_id, asset.id);
    }

    #[test]
    fn test_burn_description_serialization() {
        let key = SaplingKey::generate_key();
        let creator = key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(creator, name, metadata).unwrap();
        let value = 5;

        let builder = BurnBuilder::new(asset.id, value);
        let burn = builder.build();

        let mut serialized_description = vec![];
        burn.write(&mut serialized_description)
            .expect("should be able to serialize description");

        let deserialized_description = BurnDescription::read(&serialized_description[..])
            .expect("should be able to deserialize valid description");

        assert_eq!(burn.asset_id, deserialized_description.asset_id);
        assert_eq!(burn.value, deserialized_description.value);

        let mut reserialized_description = vec![];
        deserialized_description
            .write(&mut reserialized_description)
            .expect("should be able to serialize proof again");

        assert_eq!(serialized_description, reserialized_description);
    }
}
