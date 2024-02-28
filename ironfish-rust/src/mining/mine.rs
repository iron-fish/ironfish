/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use fish_hash::Context;

/// returns true if a <= b when treating both as 32 byte big endian numbers.
pub(crate) fn bytes_lte(a: &[u8], b: &[u8]) -> bool {
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

pub(crate) fn mine_batch_blake3(
    header_bytes: &mut [u8],
    xn_length: u8,
    target: &[u8],
    start: u64,
    step_size: usize,
    batch_size: u64,
) -> Option<u64> {
    let end = start + batch_size;
    for i in (start..=end).step_by(step_size) {
        header_bytes[xn_length as usize..8].copy_from_slice(&i.to_be_bytes()[xn_length as usize..]);

        let hash = blake3::hash(header_bytes);

        if bytes_lte(hash.as_bytes(), target) {
            let mut bytes = [0u8; 8];
            bytes.copy_from_slice(&header_bytes[0..8]);
            return Some(u64::from_be_bytes(bytes));
        }
    }
    None
}

pub(crate) fn mine_batch_fish_hash(
    context: &mut Context,
    header_bytes: &mut [u8],
    xn_length: u8,
    target: &[u8],
    start: u64,
    step_size: usize,
    batch_size: u64,
) -> Option<u64> {
    let end = start + batch_size;
    for i in (start..=end).step_by(step_size) {
        header_bytes[172 + xn_length as usize..]
            .copy_from_slice(&i.to_be_bytes()[xn_length as usize..]);

        let mut hash = [0u8; 32];
        {
            fish_hash::hash(&mut hash, context, header_bytes);
        }

        if bytes_lte(&hash, target) {
            let mut bytes = [0u8; 8];
            bytes.copy_from_slice(&header_bytes[172..180]);
            return Some(u64::from_be_bytes(bytes));
        }
    }

    None
}

#[cfg(test)]
mod test {
    use std::io::Cursor;

    use byteorder::{BigEndian, ReadBytesExt};

    use crate::mining::mine::mine_batch_fish_hash;

    use super::{bytes_lte, mine_batch_blake3};

    #[test]
    fn test_mine_batch_no_match() {
        let header_bytes = &mut [0, 1, 2, 4, 5, 6, 7, 8];
        let target = &[0u8; 32];
        let batch_size = 1;
        let start = 42;
        let step_size = 1;

        let result = mine_batch_blake3(header_bytes, 0, target, start, step_size, batch_size);

        assert!(result.is_none())
    }

    #[test]
    fn test_mine_batch_match() {
        let header_bytes = &mut [0, 1, 2, 4, 5, 6, 7, 8];
        let batch_size = 3;
        let start = 42;
        let step_size = 1;

        // Hardcoded target value derived from a randomness of 43, which is lower than 42
        // This allows us to test the looping and target comparison a little better
        let target: &[u8; 32] = &[
            74, 52, 167, 52, 16, 135, 245, 240, 229, 92, 212, 133, 140, 231, 169, 56, 16, 105, 46,
            67, 145, 116, 198, 241, 183, 88, 140, 172, 79, 139, 210, 162,
        ];

        let result = mine_batch_blake3(header_bytes, 0, target, start, step_size, batch_size);

        assert!(result.is_some());
        assert_eq!(result.unwrap(), 43);
    }

    #[test]
    fn test_mine_batch_match_fish_hash() {
        let header_bytes = &mut [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].repeat(18);
        let batch_size = 3;
        let start = 43;
        let step_size = 1;

        let context = &mut fish_hash::Context::new(false, None);

        // Hardcoded target value derived from a randomness of 45, which is lower than 42
        // This allows us to test the looping and target comparison a little better
        let target: &[u8; 32] = &[
            59, 125, 43, 4, 254, 19, 32, 88, 203, 188, 220, 43, 193, 139, 194, 164, 61, 99, 44, 90,
            151, 122, 236, 65, 253, 171, 148, 82, 130, 54, 122, 195,
        ];

        let result = mine_batch_fish_hash(
            context,
            header_bytes,
            0,
            target,
            start,
            step_size,
            batch_size,
        );

        assert!(result.is_some());
        assert_eq!(result.unwrap(), 45);
    }

    #[test]
    fn test_mine_batch_step_size() {
        let header_bytes_base = &mut (0..128).collect::<Vec<u8>>();
        let target = &[0u8; 32];
        let mut start = 0;
        let batch_size: u64 = 10;
        let step_size: usize = 3;
        // Batch 1 should test i values between 0 and 11. Technically (thread 3
        // start (2) + batch_size (10) = 12), but with step_size being 3, the last
        // value in bounds is 11.
        // Batch 2 should test i values between 12 and 23
        // Batch 3 should test i values between 24 and 35

        // Uses i values: 0, 3, 6, 9
        let header_bytes = &mut header_bytes_base.clone();
        let _ = mine_batch_blake3(header_bytes, 0, target, start, step_size, batch_size);

        let mut cursor = Cursor::new(header_bytes);
        let end = cursor.read_u64::<BigEndian>().unwrap();
        assert_eq!(end, 9);

        // Uses i values: 1, 4, 7, 10
        let header_bytes = &mut header_bytes_base.clone();
        let _ = mine_batch_blake3(header_bytes, 0, target, start + 1, step_size, batch_size);

        let mut cursor = Cursor::new(header_bytes);
        let end = cursor.read_u64::<BigEndian>().unwrap();
        assert_eq!(end, 10);

        // Uses i values: 2, 5, 8, 11
        let header_bytes = &mut header_bytes_base.clone();
        let _ = mine_batch_blake3(header_bytes, 0, target, start + 2, step_size, batch_size);

        let mut cursor = Cursor::new(header_bytes);
        let end = cursor.read_u64::<BigEndian>().unwrap();
        assert_eq!(end, 11);

        // Second batch
        start += batch_size + step_size as u64 - (batch_size % step_size as u64);
        // Simple sanity check to make sure this batch is not overlapping values from the previous batch
        assert!(start > end);

        // Uses i values: 12, 15, 18, 21
        let header_bytes = &mut header_bytes_base.clone();
        let _ = mine_batch_blake3(header_bytes, 0, target, start, step_size, batch_size);

        let mut cursor = Cursor::new(header_bytes);
        let end = cursor.read_u64::<BigEndian>().unwrap();
        assert_eq!(end, 21);

        // Uses i values: 13, 16, 19, 22
        let header_bytes = &mut header_bytes_base.clone();
        let _ = mine_batch_blake3(header_bytes, 0, target, start + 1, step_size, batch_size);

        let mut cursor = Cursor::new(header_bytes);
        let end = cursor.read_u64::<BigEndian>().unwrap();
        assert_eq!(end, 22);

        // Uses i values: 14, 17, 20, 23
        let header_bytes = &mut header_bytes_base.clone();
        let _ = mine_batch_blake3(header_bytes, 0, target, start + 2, step_size, batch_size);

        let mut cursor = Cursor::new(header_bytes);
        let end = cursor.read_u64::<BigEndian>().unwrap();
        assert_eq!(end, 23);

        // Third batch
        start += batch_size + step_size as u64 - (batch_size % step_size as u64);
        // Simple sanity check to make sure this batch is not overlapping values from the previous batch
        assert!(start > end);

        // Uses i values: 24, 27, 30, 33
        let header_bytes = &mut header_bytes_base.clone();
        let _ = mine_batch_blake3(header_bytes, 0, target, start, step_size, batch_size);

        let mut cursor = Cursor::new(header_bytes);
        let end = cursor.read_u64::<BigEndian>().unwrap();
        assert_eq!(end, 33);

        // Uses i values: 25, 28, 31, 34
        let header_bytes = &mut header_bytes_base.clone();
        let _ = mine_batch_blake3(header_bytes, 0, target, start + 1, step_size, batch_size);

        let mut cursor = Cursor::new(header_bytes);
        let end = cursor.read_u64::<BigEndian>().unwrap();
        assert_eq!(end, 34);

        // Uses i values: 26, 29, 32, 35
        let header_bytes = &mut header_bytes_base.clone();
        let _ = mine_batch_blake3(header_bytes, 0, target, start + 2, step_size, batch_size);

        let mut cursor = Cursor::new(header_bytes);
        let end = cursor.read_u64::<BigEndian>().unwrap();
        assert_eq!(end, 35);
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

        assert!(bytes_lte(small, big));
        assert!(bytes_lte(small, small));
        assert!(!bytes_lte(big, small));
    }
}
