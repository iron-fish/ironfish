/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::errors::IronfishError;

/// Helper functions to convert pairing parts to bytes
///
/// The traits in the pairing and zcash_primitives libraries
/// all have functions for serializing, but their interface
/// can be a bit clunky if you're just working with bytearrays.
use ff::PrimeField;
use group::GroupEncoding;

use std::io;

pub(crate) fn read_scalar<F: PrimeField, R: io::Read>(mut reader: R) -> Result<F, IronfishError> {
    let mut fr_repr = F::Repr::default();
    reader.read_exact(fr_repr.as_mut())?;

    Option::from(F::from_repr(fr_repr)).ok_or(IronfishError::InvalidData)
}

pub(crate) fn read_point<G: GroupEncoding, R: io::Read>(mut reader: R) -> Result<G, IronfishError> {
    let mut point_repr = G::Repr::default();
    reader.read_exact(point_repr.as_mut())?;

    Option::from(G::from_bytes(&point_repr)).ok_or(IronfishError::InvalidData)
}

/// Output the bytes as a hexadecimal String
pub fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<Vec<String>>()
        .join("")
}

/// Output the hexadecimal String as bytes
pub fn hex_to_bytes(hex: &str) -> Result<Vec<u8>, IronfishError> {
    let mut bite_iterator = hex.as_bytes().iter().map(|b| match b {
        b'0'..=b'9' => Ok(b - b'0'),
        b'a'..=b'f' => Ok(b - b'a' + 10),
        b'A'..=b'F' => Ok(b - b'A' + 10),
        _ => Err(IronfishError::InvalidData),
    });
    let mut bytes = Vec::new();
    let mut high = bite_iterator.next();
    let mut low = bite_iterator.next();
    loop {
        match (high, low) {
            (Some(Ok(h)), Some(Ok(l))) => bytes.push(h << 4 | l),
            (None, None) => break,
            _ => return Err(IronfishError::InvalidData),
        }
        high = bite_iterator.next();
        low = bite_iterator.next();
    }

    Ok(bytes)
}

pub mod aead {
    use crate::errors::IronfishError;
    use chacha20poly1305::aead::{AeadInPlace, NewAead};
    use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};

    pub const MAC_SIZE: usize = 16;

    /// Encrypt the plaintext using the given key, and append the MAC tag to the
    /// end of the output array to be decrypted and checked in one step below.
    ///
    /// This is just a facade around the ChaCha20Poly1305 struct. The nonce and
    /// associated data are zeroed.
    pub(crate) fn encrypt<const SIZE: usize>(
        key: &[u8; 32],
        plaintext: &[u8],
    ) -> Result<[u8; SIZE], IronfishError> {
        let mut encrypted_output = [0u8; SIZE];
        encrypted_output[..plaintext.len()].copy_from_slice(plaintext);

        let encryptor = ChaCha20Poly1305::new(Key::from_slice(key));

        let tag = encryptor
            .encrypt_in_place_detached(
                &Nonce::default(),
                &[],
                &mut encrypted_output[..plaintext.len()],
            )
            .map_err(|_| IronfishError::InvalidSigningKey)?;
        encrypted_output[plaintext.len()..].copy_from_slice(&tag);

        Ok(encrypted_output)
    }

    /// Decrypt the encrypted text using the given key and ciphertext, also checking
    /// that the mac tag is correct.

    pub(crate) fn decrypt<const SIZE: usize>(
        key: &[u8; 32],
        ciphertext: &[u8],
    ) -> Result<[u8; SIZE], IronfishError> {
        let decryptor = ChaCha20Poly1305::new(Key::from_slice(key));

        let mut plaintext = [0u8; SIZE];
        plaintext.copy_from_slice(&ciphertext[..SIZE]);

        decryptor
            .decrypt_in_place_detached(
                &Nonce::default(),
                &[],
                &mut plaintext,
                ciphertext[SIZE..].into(),
            )
            .map_err(|_| IronfishError::InvalidDecryptionKey)?;

        Ok(plaintext)
    }

    #[cfg(test)]
    mod test {
        use rand::Rng;

        use crate::{note::ENCRYPTED_NOTE_SIZE, serializing::aead};

        use super::{decrypt, encrypt};

        #[test]
        fn test_aead_facade() {
            let key = b"an example very very secret key.";
            const SIZE: usize = ENCRYPTED_NOTE_SIZE + aead::MAC_SIZE;
            let mut plaintext = [0u8; ENCRYPTED_NOTE_SIZE];
            // fill with random bytes to emulate expected plaintext
            rand::thread_rng().fill(&mut plaintext[..]);
            let encrypted_text: [u8; SIZE] =
                encrypt(key, &plaintext[..]).expect("Should successfully encrypt plaintext");

            let decrypted_plaintext: [u8; ENCRYPTED_NOTE_SIZE] =
                decrypt(key, &encrypted_text[..]).expect("Should successfully decrypt plaintext");
            assert_eq!(decrypted_plaintext, plaintext);
        }
    }
}
