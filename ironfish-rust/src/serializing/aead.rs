/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::errors::{IronfishError, IronfishErrorKind};
use chacha20poly1305::aead::AeadInPlace;
use chacha20poly1305::{ChaCha20Poly1305, Key, KeyInit, Nonce};

pub const MAC_SIZE: usize = 16;

/// IMPORTANT: This method should only be used with unique keys as the nonce is zeroed!
///
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
        .map_err(|_| IronfishError::new(IronfishErrorKind::InvalidSigningKey))?;
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
        .map_err(|_| IronfishError::new(IronfishErrorKind::InvalidDecryptionKey))?;

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
