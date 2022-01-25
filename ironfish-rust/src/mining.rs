/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use byteorder::{BigEndian, WriteBytesExt};
use num_bigint::BigUint;

// Javascript's Number.MAX_SAFE_INTEGER
const MAX_SAFE_INTEGER: i64 = 9007199254740991;

pub struct MineHeaderResult {
    pub randomness: f64,
    pub found_match: bool,
}

pub fn slice_to_biguint(slice: &[u8]) -> BigUint {
    BigUint::from_bytes_be(slice)
}

pub fn randomize_header(initial_randomness: i64, i: i64, mut header_bytes: &mut [u8]) -> i64 {
    // The intention here is to wrap randomness between 0 inclusive and Number.MAX_SAFE_INTEGER inclusive
    let randomness = if i > MAX_SAFE_INTEGER + initial_randomness {
        i - (MAX_SAFE_INTEGER - initial_randomness) - 1
    } else {
        initial_randomness + i
    };

    header_bytes
        .write_f64::<BigEndian>(randomness as f64)
        .unwrap();

    randomness
}

pub fn mine_header_batch(
    header_bytes: &mut [u8],
    initial_randomness: i64,
    target: BigUint,
    batch_size: i64,
) -> MineHeaderResult {
    let mut result = MineHeaderResult {
        randomness: 0.0,
        found_match: false,
    };

    let target_bytes = biguint_to_bytes(&target);

    for i in 0..batch_size {
        let randomness = randomize_header(initial_randomness, i, header_bytes);
        let hash = blake3::hash(&header_bytes);
        let new_target_bytes = hash.as_bytes();

        if bytes_lte(*new_target_bytes, target_bytes) {
            result.randomness = randomness as f64;
            result.found_match = true;
            break;
        }
    }

    result
}

/// Converts a BigUInt to 32 bytes, big endian.
fn biguint_to_bytes(num: &BigUint) -> [u8; 32] {
    let bytes = num.to_bytes_le();

    if bytes.len() > 32 {
        return [255; 32];
    }

    let mut ret: [u8; 32] = [0; 32];
    for (i, b) in bytes.into_iter().enumerate() {
        ret[i] = b;
    }
    ret.reverse();
    ret
}

/// returns true if a <= b when treating both as 32 byte big endian numbers.
fn bytes_lte(a: [u8; 32], b: [u8; 32]) -> bool {
    for i in 0..32 {
        if a[i] < b[i] {
            return true;
        }
        if a[i] > b[i] {
            return false;
        }
    }

    true
}

#[cfg(test)]
mod test {
    use super::{biguint_to_bytes, bytes_lte, mine_header_batch};
    use num_bigint::{BigUint, ToBigUint};

    #[test]
    fn test_mine_header_batch_no_match() {
        let header_bytes = &mut [0, 1, 2, 4, 5, 6, 7, 8];
        let initial_randomness = 42;
        let target = 1.to_biguint().unwrap();
        let batch_size = 1;

        let result = mine_header_batch(header_bytes, initial_randomness, target, batch_size);

        assert_eq!(result.randomness, 0.0);
        assert_eq!(result.found_match, false);
    }

    #[test]
    fn test_mine_header_batch_match() {
        let header_bytes = &mut [0, 1, 2, 4, 5, 6, 7, 8];
        let initial_randomness = 42;
        let batch_size = 2;

        // Hardcoded target value derived from a randomness of 43, which is lower than 42
        // This allows us to test the looping and target comparison a little better
        let target = BigUint::parse_bytes(
            b"79252921311571896876741732122853158648377418256230310330051824308488495331022",
            10,
        )
        .unwrap();

        let result = mine_header_batch(header_bytes, initial_randomness, target, batch_size);

        assert_eq!(result.randomness, 43.0);
        assert_eq!(result.found_match, true);
    }

    #[test]
    fn test_mine_biguint_to_bytes() {
        let actual1 = biguint_to_bytes(&1.to_biguint().unwrap());
        let expected1 = [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 1,
        ];
        assert_eq!(actual1, expected1);

        let actual256 = biguint_to_bytes(&256.to_biguint().unwrap());
        let expected256 = [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 1, 0,
        ];
        assert_eq!(actual256, expected256);
    }

    #[test]
    fn test_mine_bytes_lte() {
        let big = [
            255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0,
        ];
        let small = [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 1,
        ];

        assert_eq!(true, bytes_lte(small, big));
        assert_eq!(true, bytes_lte(small, small));
        assert_eq!(false, bytes_lte(big, small));
    }
}
