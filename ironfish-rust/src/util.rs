/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use std::cmp;

/// Helper function to create an array from a string. If the string is not as
/// large as the array, it will be filled with 0. If the string is too large, it
/// will only include up to the size of the array.
pub fn str_to_array<const SIZE: usize>(string: &str) -> [u8; SIZE] {
    let bytes = string.as_bytes();
    let num_to_copy = cmp::min(bytes.len(), SIZE);

    let mut arr = [0u8; SIZE];
    arr[..num_to_copy].copy_from_slice(&bytes[..num_to_copy]);

    arr
}

#[cfg(test)]
mod test {
    use super::str_to_array;

    #[test]
    fn test_str_to_array_string_fits() {
        let string_fits = "asdf";
        let arr: [u8; 8] = str_to_array(string_fits);

        assert_eq!(arr, [97, 115, 100, 102, 0, 0, 0, 0]);
    }

    #[test]
    fn test_str_to_array_string_too_long() {
        let string_too_big = "asdfasdf";
        let arr: [u8; 4] = str_to_array(string_too_big);

        assert_eq!(arr, [97, 115, 100, 102]);
    }
}
