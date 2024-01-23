/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

pub mod aead;

use crate::errors::{IronfishError, IronfishErrorKind};

/// Helper functions to convert pairing parts to bytes
///
/// The traits in the pairing and zcash_primitives libraries
/// all have functions for serializing, but their interface
/// can be a bit clunky if you're just working with bytearrays.
use ff::PrimeField;
use group::GroupEncoding;
use ironfish_zkp::ProofGenerationKey;

use std::io;

const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";

pub(crate) fn read_scalar<F: PrimeField, R: io::Read>(mut reader: R) -> Result<F, IronfishError> {
    let mut fr_repr = F::Repr::default();
    reader.read_exact(fr_repr.as_mut())?;

    Option::from(F::from_repr(fr_repr))
        .ok_or_else(|| IronfishError::new(IronfishErrorKind::InvalidData))
}

pub(crate) fn read_point<G: GroupEncoding, R: io::Read>(mut reader: R) -> Result<G, IronfishError> {
    let mut point_repr = G::Repr::default();
    reader.read_exact(point_repr.as_mut())?;

    Option::from(G::from_bytes(&point_repr))
        .ok_or_else(|| IronfishError::new(IronfishErrorKind::InvalidData))
}

/// Output the bytes as a hexadecimal String
pub fn bytes_to_hex(bytes: &[u8]) -> String {
    let mut hex: Vec<u8> = vec![0; bytes.len() * 2];

    for (i, b) in bytes.iter().enumerate() {
        hex[i * 2] = HEX_CHARS[(b >> 4) as usize];
        hex[i * 2 + 1] = HEX_CHARS[(b & 0x0f) as usize];
    }

    unsafe { String::from_utf8_unchecked(hex) }
}

/// Output the hexadecimal String as bytes
pub fn hex_to_bytes<const SIZE: usize>(hex: &str) -> Result<[u8; SIZE], IronfishError> {
    if hex.len() != SIZE * 2 {
        return Err(IronfishError::new(IronfishErrorKind::InvalidData));
    }

    let mut bytes = [0; SIZE];

    let hex_iter = hex.as_bytes().chunks_exact(2);

    for (i, hex) in hex_iter.enumerate() {
        bytes[i] = hex_to_u8(hex[0])? << 4 | hex_to_u8(hex[1])?;
    }

    Ok(bytes)
}

pub fn hex_to_vec_bytes(hex: &str) -> Result<Vec<u8>, IronfishError> {
    if hex.len() % 2 != 0 {
        return Err(IronfishError::new(IronfishErrorKind::InvalidData));
    }

    let mut bytes = Vec::new();

    let hex_iter = hex.as_bytes().chunks_exact(2);

    for (_, hex) in hex_iter.enumerate() {
        bytes.push(hex_to_u8(hex[0])? << 4 | hex_to_u8(hex[1])?);
    }

    Ok(bytes)
}

#[inline]
fn hex_to_u8(char: u8) -> Result<u8, IronfishError> {
    match char {
        b'0'..=b'9' => Ok(char - b'0'),
        b'a'..=b'f' => Ok(char - b'a' + 10),
        b'A'..=b'F' => Ok(char - b'A' + 10),
        _ => Err(IronfishError::new(IronfishErrorKind::InvalidData)),
    }
}

#[cfg(test)]
mod test {
    use crate::serializing::{bytes_to_hex, hex_to_bytes, hex_to_vec_bytes};

    #[test]
    fn test_hex_to_vec_bytes_valid() {
        let hex = "A1B2C3";
        let expected_bytes = vec![161, 178, 195];

        let result = hex_to_vec_bytes(hex).expect("valid hex");

        assert_eq!(result, expected_bytes);
    }

    #[test]
    fn test_hex_to_vec_bytes_invalid_char() {
        let hex = "A1B2G3";
        hex_to_vec_bytes(hex).expect_err("invalid hex should throw an error");
    }

    #[test]
    fn test_hex_to_vec_bytes_invalid_hex_with_odd_length() {
        let hex = "A1B2C";
        hex_to_vec_bytes(hex).expect_err("invalid hex should throw an error");
    }

    #[test]
    fn hex_serde() {
        const HEX_STRING: &str = "68656C6C6F20776F726C6420616E64207374756666";
        const HEX_LOWER: &str = "68656c6c6f20776f726c6420616e64207374756666";
        const BYTE_LENGTH: usize = HEX_STRING.len() / 2;
        // Same as above with the last character removed, which makes the hex
        // invalid as the length of a hex string must be divisible by 2
        const INVALID_HEX: &str = "68656C6C6F20776F726C6420616E6420737475666";

        hex_to_bytes::<BYTE_LENGTH>(INVALID_HEX).expect_err("invalid hex should throw an error");

        let bytes: [u8; BYTE_LENGTH] = hex_to_bytes(HEX_STRING).expect("converts hex to bytes");
        let lower_bytes: [u8; BYTE_LENGTH] =
            hex_to_bytes(HEX_STRING).expect("converts hex to bytes");

        assert_eq!(bytes, lower_bytes);

        let hex = bytes_to_hex(&bytes);
        let lower_hex = bytes_to_hex(&lower_bytes);

        assert_eq!(HEX_LOWER, hex);
        assert_eq!(HEX_LOWER, lower_hex);
    }
}
