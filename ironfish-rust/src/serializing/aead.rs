/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::errors::IronfishError;
use chacha20::ChaCha20;
use chacha20::cipher::{KeyIvInit, StreamCipherSeek, StreamCipher};
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


/// WARNING:
/// 1. Decryption can only occur for 1-n bytes, not n-m bytes 
/// 2. There is no MAC tag check here, so this is not secure.
/// 3. There is no guarantee the encrypted text is valid, it will return a "value" whether the key is valid or not
/// 
/// this is a partial decryption, and should only be used for cases where
/// potential tampering is not a concern. For example, trial decryption of
/// a note for determining if that note is relevant to an account, where the full ciphertext
/// will subsequently be downloaded 
pub fn decrypt_partial(
    key: &[u8; 32],
    truncated_ciphertext: &Vec<u8>,
) -> Vec<u8> {
    let mut truncated_encrypted_text = truncated_ciphertext.clone();
    truncated_encrypted_text.copy_from_slice(&truncated_ciphertext[..]);

    let mut keystream = ChaCha20::new(key.as_ref().into(), [0u8; 12][..].into());
    keystream.seek(64);
    keystream.apply_keystream(&mut truncated_encrypted_text);

    truncated_encrypted_text
}

#[cfg(test)]
mod test {
    use ff::Field;
    use ff::PrimeField;
    use ironfish_zkp::constants::ASSET_ID_LENGTH;
    use rand::Rng;


    use crate::SaplingKey;
    use crate::serializing::aead::decrypt_partial;
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

    #[test]
    fn test_partial_decrypt_succeed() {
        let key = b"an example very very secret key.";
        
        // emulate an encrypted note, where first 32 bytes is randomness
        const SIZE: usize = ENCRYPTED_NOTE_SIZE + aead::MAC_SIZE;
        const FR_SIZE: usize = 32; // size of Fr in bytes
        let mut rng = rand::thread_rng();
        let mut plaintext = [0u8; ENCRYPTED_NOTE_SIZE];
        let secret = jubjub::Fr::random(&mut rng);
        let fr_bytes = secret.to_repr();
        let key2 = SaplingKey::generate_key();
        
        // Copy the bytes of Fr into plaintext
        plaintext[..FR_SIZE].copy_from_slice(fr_bytes.as_ref());
        rng.fill(&mut plaintext[FR_SIZE..]);    
    
        // Encrypt the plaintext
        let encrypted_text: [u8; SIZE] =
            encrypt(key, &plaintext[..]).expect("Should successfully encrypt plaintext");
        
        let mut truncated_encrypted_text = [0u8; FR_SIZE];
        truncated_encrypted_text.copy_from_slice(&encrypted_text[..FR_SIZE]);

        let truncated_decrypted_text: [u8; FR_SIZE] = decrypt_partial(key, &truncated_encrypted_text.to_vec()).try_into().expect("should have 32 bytes");
        jubjub::Fr::from_bytes(&truncated_decrypted_text).unwrap();
    }
}
