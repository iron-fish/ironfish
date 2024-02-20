/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use crate::{errors::IronfishError, transaction::unsigned::UnsignedTransaction};
use ironfish_frost::{frost::SigningPackage as FrostSigningPackage, participant::Identity};
use std::io;

#[derive(Clone)]
pub struct SigningPackage {
    pub unsigned_transaction: UnsignedTransaction,
    pub frost_signing_package: FrostSigningPackage,
    pub signers: Vec<Identity>,
}

impl SigningPackage {
    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        let frost_pkg = self.frost_signing_package.serialize()?;
        let frost_pkg_len = u32::try_from(frost_pkg.len())?.to_le_bytes();
        writer.write_all(&frost_pkg_len)?;
        writer.write_all(&frost_pkg)?;

        let signers_len = u32::try_from(self.signers.len())?.to_le_bytes();
        writer.write_all(&signers_len)?;
        for identity in &self.signers {
            writer.write_all(&identity.serialize()[..])?;
        }

        self.unsigned_transaction.write(&mut writer)
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let mut frost_pkg_len = [0u8; 4];
        reader.read_exact(&mut frost_pkg_len)?;
        let frost_pkg_len = u32::from_le_bytes(frost_pkg_len) as usize;

        let mut frost_pkg = vec![0u8; frost_pkg_len];
        reader.read_exact(&mut frost_pkg)?;

        let mut signers_len = [0u8; 4];
        reader.read_exact(&mut signers_len)?;
        let signers_len = u32::from_le_bytes(signers_len) as usize;

        let mut signers = Vec::with_capacity(signers_len);
        for _ in 0..signers_len {
            signers.push(Identity::deserialize_from(&mut reader)?);
        }

        let frost_signing_package = FrostSigningPackage::deserialize(&frost_pkg)?;
        let unsigned_transaction = UnsignedTransaction::read(&mut reader)?;

        Ok(SigningPackage {
            unsigned_transaction,
            frost_signing_package,
            signers,
        })
    }
}
