/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::errors::{IronfishError, IronfishErrorKind};
use byteorder::{ReadBytesExt, WriteBytesExt};
use std::io;

#[derive(Copy, Clone, Eq, PartialEq, Ord, PartialOrd, Debug)]
pub enum DataType {
    Undefined,
    Evm,
}

impl DataType {
    pub const fn as_u8(self) -> u8 {
        match self {
            Self::Undefined => 1,
            Self::Evm => 2,
        }
    }

    pub const fn from_u8(value: u8) -> Option<Self> {
        match value {
            1 => Some(Self::Undefined),
            2 => Some(Self::Evm),
            _ => None,
        }
    }

    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        writer.write_u8((*self).into())?;
        Ok(())
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        Self::try_from(reader.read_u8()?)
    }
}

impl TryFrom<u8> for DataType {
    type Error = IronfishError;

    #[inline]
    fn try_from(value: u8) -> Result<Self, Self::Error> {
        Self::from_u8(value).ok_or_else(|| IronfishError::new(IronfishErrorKind::InvalidDataType))
    }
}

impl From<DataType> for u8 {
    #[inline]
    fn from(version: DataType) -> u8 {
        version.as_u8()
    }
}
