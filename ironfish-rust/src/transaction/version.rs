/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::errors::{IronfishError, IronfishErrorKind};
use byteorder::{ReadBytesExt, WriteBytesExt};
use std::io;

/// The serialization version used by a [`Transaction`](crate::Transaction).
///
/// When converting a [`Transaction`](crate::Transaction) to/from bytes, the serialization version
/// specifies which serialization to use, and which transaction features to enable.
#[derive(Copy, Clone, Eq, PartialEq, Ord, PartialOrd, Debug)]
pub enum TransactionVersion {
    /// Initial version used at mainnet launch.
    V1,
    /// Adds the `transfer_ownership_to` field of
    /// [`MintDescription`](crate::transaction::mints::MintDescription).
    V2,
}

impl TransactionVersion {
    pub const fn as_u8(self) -> u8 {
        match self {
            Self::V1 => 1,
            Self::V2 => 2,
        }
    }

    pub const fn from_u8(value: u8) -> Option<Self> {
        match value {
            1 => Some(Self::V1),
            2 => Some(Self::V2),
            _ => None,
        }
    }

    pub const fn latest() -> Self {
        Self::V2
    }

    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        writer.write_u8((*self).into())?;
        Ok(())
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        Self::try_from(reader.read_u8()?)
    }

    /// Returns `true` if this [`TransactionVersion`] supports the `transfer_ownership_to` field of
    /// [`MintDescription`](crate::transaction::mints::MintDescription).
    pub fn has_mint_transfer_ownership_to(self) -> bool {
        self >= Self::V2
    }
}

impl TryFrom<u8> for TransactionVersion {
    type Error = IronfishError;

    #[inline]
    fn try_from(value: u8) -> Result<Self, Self::Error> {
        Self::from_u8(value)
            .ok_or_else(|| IronfishError::new(IronfishErrorKind::InvalidTransactionVersion))
    }
}

impl From<TransactionVersion> for u8 {
    #[inline]
    fn from(version: TransactionVersion) -> u8 {
        version.as_u8()
    }
}

#[cfg(test)]
mod tests {
    use super::TransactionVersion;
    use super::TransactionVersion::*;

    #[test]
    fn test_ordering() {
        assert!(V1 == V1);
        assert!(V2 == V2);

        assert!(V1 < V2);
        assert!(V1 <= V2);

        assert!(V2 > V1);
        assert!(V2 >= V1);

        assert!(V1 <= V1);
        assert!(V1 >= V1);

        assert!(V2 <= V2);
        assert!(V2 >= V2);
    }

    #[test]
    fn test_as_u8() {
        assert_eq!(V1.as_u8(), 1);
        assert_eq!(V2.as_u8(), 2);
    }

    #[test]
    fn test_from_u8() {
        assert_eq!(TransactionVersion::from_u8(0), None);
        assert_eq!(TransactionVersion::from_u8(1), Some(V1));
        assert_eq!(TransactionVersion::from_u8(2), Some(V2));
        for i in 3..=255 {
            assert_eq!(TransactionVersion::from_u8(i), None);
        }
    }
}
