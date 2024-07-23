/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

 use std::io;

 use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
 
 use crate::errors::IronfishError;
 
 /// TO BE USED ONLY WITH EVM
 pub struct EvmIronBuilder {
     /// Amount of asset being transferred into/out of the UTXO set
     pub value: i128,
 }
 
 impl EvmIronBuilder {
     pub fn new(value: i128) -> Self {
         Self { value }
     }
 
     pub fn build(&self) -> EvmIronBuilder {
        EvmIronBuilder {
             value: self.value,
         }
     }
 }
 
 /// This description represents an action to decrease the supply of an existing
 /// asset on Iron Fish
 #[derive(Clone)]
 pub struct EvmIron {
 
     /// Amount of asset to burn
     pub value: i128,
 }
 
 impl EvmIron {
     /// Write the signature of this proof to the provided writer.
     ///
     /// The signature is used by the transaction to calculate the signature
     /// hash. Having this data essentially binds the note to the transaction,
     /// proving that it is actually part of that transaction.
     pub(crate) fn serialize_signature_fields<W: io::Write>(
         &self,
         mut writer: W,
     ) -> Result<(), IronfishError> {
         writer.write_i128::<LittleEndian>(self.value)?;
 
         Ok(())
     }
 
     pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
         let value = reader.read_i128::<LittleEndian>()?;
 
         Ok(EvmIron { value })
     }
 
     /// Stow the bytes of this [`BurnDescription`] in the given writer.
     pub fn write<W: io::Write>(&self, writer: W) -> Result<(), IronfishError> {
         self.serialize_signature_fields(writer)?;
 
         Ok(())
     }
 }
 