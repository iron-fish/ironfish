/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use reth_primitives::{
    revm_primitives::FixedBytes, sign_message, Address, Transaction, TxKind, TxLegacy, U256,
};
use std::io;

use crate::{errors::IronfishError, SaplingKey};
#[derive(Clone, PartialEq, Debug)]
pub struct WrappedEvmDescription {
    pub(crate) description: EvmDescription,
}

impl WrappedEvmDescription {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        nonce: u64,
        gas_price: u64,
        gas_limit: u64,
        to: Option<[u8; 20]>,
        value: u64,
        data: Vec<u8>,
        private_iron: u64,
        public_iron: u64,
        v: Option<u64>,
        r: Option<[u8; 32]>,
        s: Option<[u8; 32]>,
    ) -> Self {
        let description = EvmDescription {
            nonce,
            gas_price,
            gas_limit,
            to,
            value,
            data,
            v: v.map_or(0, |v| v),
            r: r.map_or([0u8; 32], |r| r),
            s: s.map_or([0u8; 32], |s| s),
            private_iron,
            public_iron,
        };

        Self { description }
    }

    pub fn read<R: io::Read>(reader: R) -> Result<Self, io::Error> {
        let description = EvmDescription::read(reader)?;

        Ok(Self { description })
    }

    pub fn write<W: io::Write>(&self, writer: W) -> Result<(), IronfishError> {
        EvmDescription::write(&self.description, writer)
    }

    pub(crate) fn serialize_signature_fields<W: io::Write>(
        &self,
        mut writer: W,
    ) -> Result<(), IronfishError> {
        self.description.serialize_signature_fields(&mut writer)
    }

    pub fn sign(mut self, spender_key: &SaplingKey) -> EvmDescription {
        if self.is_signed() {
            return self.description;
        }

        let tx_kind = match self.description.to {
            None => TxKind::Create,
            Some(address_bytes) => TxKind::Call(Address::from(address_bytes)),
        };
        let reth_tx: Transaction = Transaction::Legacy(TxLegacy {
            nonce: self.description.nonce,
            gas_price: self.description.gas_price.into(),
            gas_limit: self.description.gas_limit,
            to: tx_kind,
            value: U256::from(self.description.value),
            input: self.description.data.clone().into(),
            chain_id: None,
        });

        // TODO(hughy): add appropriate error handling for signing errors from reth
        let signature = sign_message(
            FixedBytes::from(spender_key.spending_key()),
            reth_tx.signature_hash(),
        )
        .unwrap();

        self.description.v = signature.v(None);
        self.description.r = signature.r.to_be_bytes();
        self.description.s = signature.s.to_be_bytes();

        self.description
    }

    fn is_signed(&self) -> bool {
        !(self.description.v == 0
            && self.description.r == [0u8; 32]
            && self.description.s == [0u8; 32])
    }
}

#[derive(Clone, PartialEq, Debug)]
pub struct EvmDescription {
    pub(crate) nonce: u64,
    pub(crate) gas_price: u64,
    pub(crate) gas_limit: u64,
    pub(crate) to: Option<[u8; 20]>,
    pub(crate) value: u64,
    pub(crate) data: Vec<u8>,
    pub(crate) v: u64,
    pub(crate) r: [u8; 32],
    pub(crate) s: [u8; 32],
    pub(crate) private_iron: u64,
    pub(crate) public_iron: u64,
}

impl EvmDescription {
    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, io::Error> {
        let nonce = reader.read_u64::<LittleEndian>()?;
        let gas_price = reader.read_u64::<LittleEndian>()?;
        let gas_limit = reader.read_u64::<LittleEndian>()?;

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

        let private_iron = reader.read_u64::<LittleEndian>()?;
        let public_iron = reader.read_u64::<LittleEndian>()?;

        let v = reader.read_u64::<LittleEndian>()?;

        let mut r = [0u8; 32];
        reader.read_exact(&mut r)?;

        let mut s = [0u8; 32];
        reader.read_exact(&mut s)?;

        Ok(Self {
            nonce,
            gas_price,
            gas_limit,
            to,
            value,
            data,
            v,
            r,
            s,
            private_iron,
            public_iron,
        })
    }

    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        self.serialize_signature_fields(&mut writer)?;

        writer.write_u64::<LittleEndian>(self.v)?;
        writer.write_all(&self.r)?;
        writer.write_all(&self.s)?;

        Ok(())
    }

    pub(crate) fn serialize_signature_fields<W: io::Write>(
        &self,
        mut writer: W,
    ) -> Result<(), IronfishError> {
        writer.write_u64::<LittleEndian>(self.nonce)?;
        writer.write_u64::<LittleEndian>(self.gas_price)?;
        writer.write_u64::<LittleEndian>(self.gas_limit)?;

        if let Some(to) = &self.to {
            writer.write_u8(1)?; // Indicate 'to' is present
            writer.write_all(to)?;
        } else {
            writer.write_u8(0)?; // Indicate 'to' is not present
        }

        writer.write_u64::<LittleEndian>(self.value)?;
        writer.write_u32::<LittleEndian>(self.data.len() as u32)?;
        writer.write_all(&self.data)?;
        writer.write_u64::<LittleEndian>(self.private_iron)?;
        writer.write_u64::<LittleEndian>(self.public_iron)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unsigned_serde() {
        let original_transaction = WrappedEvmDescription::new(
            9,
            1,
            2_000_000,
            Some([0x35; 20]),
            1_000_000_000_000_000_000,
            vec![],
            0,
            0,
            None,
            None,
            None,
        );

        // Write the Transaction to a Vec<u8>
        let mut buffer = Vec::new();
        original_transaction.write(&mut buffer).unwrap();

        // Read the Transaction back from the Vec<u8>
        let read_transaction = WrappedEvmDescription::read(&buffer[..]).unwrap();

        // Check that the read data is the same as the original data
        assert_eq!(
            read_transaction.description,
            original_transaction.description
        );
    }

    #[test]
    fn test_sign() {
        let key = SaplingKey::generate_key();

        let unsigned = WrappedEvmDescription::new(
            9,
            1,
            2_000_000,
            Some([0x35; 20]),
            1_000_000_000_000_000_000,
            vec![],
            0,
            0,
            None,
            None,
            None,
        );

        let signed = unsigned.sign(&key);

        assert_ne!(signed.v, 0);
        assert_ne!(signed.r, [0u8; 32]);
        assert_ne!(signed.s, [0u8; 32]);
    }

    #[test]
    fn test_sign_presigned() {
        let key = SaplingKey::generate_key();

        let r: [u8; 32] = [
            0x5e, 0x1d, 0x3a, 0x76, 0xfb, 0xf8, 0x24, 0x22, 0x0e, 0x27, 0xb5, 0xd1, 0xf8, 0xd0,
            0x78, 0x48, 0xe8, 0xa4, 0x41, 0x4b, 0x78, 0xb6, 0xd0, 0xf1, 0xe9, 0xc2, 0xb4, 0xd3,
            0xd6, 0xd3, 0xd3, 0xe5,
        ];

        let s: [u8; 32] = [
            0x7e, 0x1d, 0x3a, 0x76, 0xfb, 0xf8, 0x24, 0x22, 0x0e, 0x27, 0xb5, 0xd1, 0xf8, 0xd0,
            0x78, 0x48, 0xe8, 0xa4, 0x41, 0x4b, 0x78, 0xb6, 0xd0, 0xf1, 0xe9, 0xc2, 0xb4, 0xd3,
            0xd6, 0xd3, 0xd3, 0xe5,
        ];

        let unsigned = WrappedEvmDescription::new(
            9,
            1,
            2_000_000,
            Some([0x35; 20]),
            1_000_000_000_000_000_000,
            vec![],
            0,
            0,
            Some(38),
            Some(r),
            Some(s),
        );

        // signing a pre-signed description with another key should not mutate the signature
        let signed = unsigned.sign(&key);

        assert_eq!(signed.v, 38);
        assert_eq!(signed.r, r);
        assert_eq!(signed.s, s);
    }

    #[test]
    fn test_transaction() {
        let original_transaction = EvmDescription {
            nonce: 9,
            gas_price: 1,
            gas_limit: 2_000_000,
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
            private_iron: 0,
            public_iron: 0,
        };

        // Write the Transaction to a Vec<u8>
        let mut buffer = Vec::new();
        original_transaction.write(&mut buffer).unwrap();

        // Read the Transaction back from the Vec<u8>
        let read_transaction = EvmDescription::read(&buffer[..]).unwrap();

        // Check that the read data is the same as the original data
        assert_eq!(read_transaction.nonce, original_transaction.nonce);
        assert_eq!(read_transaction.gas_price, original_transaction.gas_price);
        assert_eq!(read_transaction.gas_limit, original_transaction.gas_limit);
        assert_eq!(read_transaction.to, original_transaction.to);
        assert_eq!(read_transaction.value, original_transaction.value);
        assert_eq!(read_transaction.data, original_transaction.data);
        assert_eq!(read_transaction.v, original_transaction.v);
        assert_eq!(read_transaction.r, original_transaction.r);
        assert_eq!(read_transaction.s, original_transaction.s);
    }
}
