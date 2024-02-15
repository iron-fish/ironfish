/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use crate::{errors::IronfishError, transaction::unsigned::UnsignedTransaction};
use ironfish_frost::frost::SigningPackage as FrostSigningPackage;
use std::io;

#[derive(Clone)]
pub struct SigningPackage {
    pub unsigned_transaction: UnsignedTransaction,
    pub frost_signing_package: FrostSigningPackage,
}

impl SigningPackage {
    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        let serialized_frost_signing_package = self.frost_signing_package.serialize()?;
        let length = u32::try_from(serialized_frost_signing_package.len())?;
        let length_bytes = length.to_le_bytes();

        writer.write_all(&length_bytes)?;
        writer.write_all(&serialized_frost_signing_package)?;
        self.unsigned_transaction.write(&mut writer)?;

        Ok(())
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let mut signing_package_length_bytes = [0u8; 4];
        reader.read_exact(&mut signing_package_length_bytes)?;

        let length = u32::from_le_bytes(signing_package_length_bytes);

        let mut frost_signing_package_bytes = vec![0u8; length as usize];
        reader.read_exact(&mut frost_signing_package_bytes)?;

        let frost_signing_package = FrostSigningPackage::deserialize(&frost_signing_package_bytes)?;
        let unsigned_transaction = UnsignedTransaction::read(&mut reader)?;

        Ok(SigningPackage {
            unsigned_transaction,
            frost_signing_package,
        })
    }
}
