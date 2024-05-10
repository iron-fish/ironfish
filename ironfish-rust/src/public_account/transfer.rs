use std::io;

use crate::{assets::asset_identifier::AssetIdentifier, errors::IronfishError, PublicAddress};

#[derive(Clone, Copy)]
pub struct PublicMemo(pub [u8; 256]);

#[derive(Clone, Copy)]
pub struct Transfer {
    pub(crate) asset_id: AssetIdentifier,
    pub(crate) amount: u64,
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
        let amount = u64::from_le_bytes(amount_buf);

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

    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        self.asset_id.write(&mut writer)?;
        writer.write_all(&self.amount.to_le_bytes())?;
        self.to.write(&mut writer)?;
        writer.write_all(&self.memo.0)?;

        Ok(())
    }

    pub fn as_bytes(&self) -> Result<Vec<u8>, IronfishError> {
        let mut bytes = Vec::new();
        self.write(&mut bytes)?;
        Ok(bytes)
    }
}
