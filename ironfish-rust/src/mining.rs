/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use byteorder::{BigEndian, WriteBytesExt};

mod mine;
mod thread;
pub mod threadpool;

// Javascript's Number.MAX_SAFE_INTEGER
const MAX_SAFE_INTEGER: i64 = 9007199254740991;

pub struct MineHeaderResult {
    pub randomness: f64,
    pub found_match: bool,
}

pub fn randomize_header(initial_randomness: i64, i: i64, mut header_bytes: &mut [u8]) -> i64 {
    // The intention here is to wrap randomness between 0 inclusive and Number.MAX_SAFE_INTEGER inclusive
    let randomness = if i > MAX_SAFE_INTEGER - initial_randomness {
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
    target: &[u8; 32],
    batch_size: i64,
) -> MineHeaderResult {
    let mut result = MineHeaderResult {
        randomness: 0.0,
        found_match: false,
    };

    for i in 0..batch_size {
        let randomness = randomize_header(initial_randomness, i, header_bytes);
        let hash = blake3::hash(header_bytes);
        let new_target_bytes = hash.as_bytes();

        if bytes_lte(new_target_bytes, target) {
            result.randomness = randomness as f64;
            result.found_match = true;
            break;
        }
    }

    result
}

/// returns true if a <= b when treating both as 32 byte big endian numbers.
fn bytes_lte(a: &[u8; 32], b: &[u8; 32]) -> bool {
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
    use super::{bytes_lte, mine_header_batch};

    #[test]
    fn test_mine_header_batch_no_match() {
        let header_bytes = &mut [0, 1, 2, 4, 5, 6, 7, 8];
        let initial_randomness = 42;
        let target = &[0u8; 32];
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
        let target: &[u8; 32] = &[
            189, 32, 143, 150, 173, 48, 164, 172, 76, 199, 72, 88, 197, 68, 105, 250, 191, 202,
            126, 52, 252, 66, 35, 112, 87, 238, 229, 149, 47, 55, 233, 45,
        ];

        let result = mine_header_batch(header_bytes, initial_randomness, target, batch_size);

        assert_eq!(result.randomness, 43.0);
        assert_eq!(result.found_match, true);
    }

    #[test]
    fn test_mine_bytes_lte() {
        let big: &[u8; 32] = &[
            255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0,
        ];
        let small: &[u8; 32] = &[
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 1,
        ];

        assert_eq!(true, bytes_lte(small, big));
        assert_eq!(true, bytes_lte(small, small));
        assert_eq!(false, bytes_lte(big, small));
    }
}
