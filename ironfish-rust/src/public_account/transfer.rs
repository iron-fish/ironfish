use std::io;

use crate::{assets::asset_identifier::AssetIdentifier, errors::IronfishError, PublicAddress};

#[derive(Clone, Copy)]
pub struct PublicMemo(pub [u8; 256]);

pub const TRANSFER_BYTE_SIZE: usize = 32 + 8 + 32 + 256;

#[derive(Clone, Copy)]
pub struct Transfer {
    pub(crate) asset_id: AssetIdentifier,
    pub(crate) amount: i64,
    // TODO assumes we are using same public address space for these accounts
    pub(crate) to: PublicAddress,
    // TODO is this a reasonable memo size
    pub(crate) memo: PublicMemo,
}

impl Transfer {
    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let asset_id = AssetIdentifier::read(&mut reader)?;
        let mut amount_buf = [0; 8];
        reader.read_exact(&mut amount_buf)?;
        let amount = i64::from_le_bytes(amount_buf);

        let to = PublicAddress::read(&mut reader)?;

        let mut memo_buf = [0; 256];
        reader.read_exact(&mut memo_buf)?;
        let memo = PublicMemo(memo_buf);

        Ok(Self {
            asset_id,
            amount,
            to,
            memo,
        })
    }

    pub fn to_bytes(&self) -> Result<[u8; TRANSFER_BYTE_SIZE], IronfishError> {
        let mut bytes = [0u8; TRANSFER_BYTE_SIZE];
        bytes[0..32].copy_from_slice(self.asset_id.as_bytes());
        bytes[32..40].copy_from_slice(&self.amount.to_le_bytes());
        bytes[40..72].copy_from_slice(&self.to.public_address());
        bytes[72..328].copy_from_slice(&self.memo.0);
        Ok(bytes)
    }
    
    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        let bytes = self.to_bytes()?;
        writer.write_all(&bytes)?;
        Ok(())
    }
}
