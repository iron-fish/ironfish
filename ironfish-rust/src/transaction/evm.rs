/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use std::io;

use crate::errors::IronfishError;

#[derive(Clone, PartialEq, Debug)]
pub struct EvmDescription {
    pub(crate) nonce: u64,
    // TODO: gas price and limit here, or in the top layer of the transaction
    // pub(crate) gas_price: u64,
    // pub(crate) gas_limit: u64,
    pub(crate) to: Option<[u8; 20]>,
    pub(crate) value: u64,
    pub(crate) data: Vec<u8>,
    pub(crate) v: u8,
    pub(crate) r: [u8; 32],
    pub(crate) s: [u8; 32],
}

impl EvmDescription {
    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, io::Error> {
        let nonce = reader.read_u64::<LittleEndian>()?;

        let to_present = reader.read_u8()?; // Read a byte to check if 'to' is present
        let mut to = None;
        if to_present == 1 {
            // If 'to' is present
            let mut to_bytes = [0u8; 20];
            reader.read_exact(&mut to_bytes)?;
            to = Some(to_bytes);
        }

        let value = reader.read_u64::<LittleEndian>()?;

        let mut data_len_buf = [0; 4];
        reader.read_exact(&mut data_len_buf)?;
        let data_len = u32::from_le_bytes(data_len_buf) as usize;

        let mut data = vec![0; data_len];
        reader.read_exact(&mut data)?;

        let v = reader.read_u8()?;

        let mut r = [0u8; 32];
        reader.read_exact(&mut r)?;

        let mut s = [0u8; 32];
        reader.read_exact(&mut s)?;

        Ok(Self {
            nonce,
            to,
            value,
            data,
            v,
            r,
            s,
        })
    }

    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        writer.write_u64::<LittleEndian>(self.nonce)?;

        if let Some(to) = &self.to {
            writer.write_u8(1)?; // Indicate 'to' is present
            writer.write_all(to)?;
        } else {
            writer.write_u8(0)?; // Indicate 'to' is not present
        }

        writer.write_u64::<LittleEndian>(self.value)?;
        writer.write_u32::<LittleEndian>(self.data.len() as u32)?;
        writer.write_all(&self.data)?;
        writer.write_u8(self.v)?;
        writer.write_all(&self.r)?;
        writer.write_all(&self.s)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transaction() {
        let original_transaction = EvmDescription {
            nonce: 9,
            to: Some([0x35; 20]),
            value: 1_000_000_000_000_000_000,
            data: vec![],
            v: 27,
            r: [
                0x5e, 0x1d, 0x3a, 0x76, 0xfb, 0xf8, 0x24, 0x22, 0x0e, 0x27, 0xb5, 0xd1, 0xf8, 0xd0,
                0x78, 0x48, 0xe8, 0xa4, 0x41, 0x4b, 0x78, 0xb6, 0xd0, 0xf1, 0xe9, 0xc2, 0xb4, 0xd3,
                0xd6, 0xd3, 0xd3, 0xe5,
            ],
            s: [
                0x7e, 0x1d, 0x3a, 0x76, 0xfb, 0xf8, 0x24, 0x22, 0x0e, 0x27, 0xb5, 0xd1, 0xf8, 0xd0,
                0x78, 0x48, 0xe8, 0xa4, 0x41, 0x4b, 0x78, 0xb6, 0xd0, 0xf1, 0xe9, 0xc2, 0xb4, 0xd3,
                0xd6, 0xd3, 0xd3, 0xe5,
            ],
        };

        // Write the Transaction to a Vec<u8>
        let mut buffer = Vec::new();
        original_transaction.write(&mut buffer).unwrap();

        // Read the Transaction back from the Vec<u8>
        let read_transaction = EvmDescription::read(&buffer[..]).unwrap();

        // Check that the read data is the same as the original data
        assert_eq!(read_transaction.nonce, original_transaction.nonce);
        assert_eq!(read_transaction.to, original_transaction.to);
        assert_eq!(read_transaction.value, original_transaction.value);
        assert_eq!(read_transaction.data, original_transaction.data);
        assert_eq!(read_transaction.v, original_transaction.v);
        assert_eq!(read_transaction.r, original_transaction.r);
        assert_eq!(read_transaction.s, original_transaction.s);
    }
}
