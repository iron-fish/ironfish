/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crypto_box::{
    aead::{generic_array::GenericArray, Aead, AeadCore},
    PublicKey, SalsaBox, SecretKey,
};
use rand::{rngs::OsRng, RngCore};

use crate::errors::{IronfishError, IronfishErrorKind};

pub const KEY_LENGTH: usize = crypto_box::KEY_SIZE;
pub const NONCE_LENGTH: usize = 24;

pub fn new_secret_key() -> SecretKey {
    let mut rng = OsRng;

    SecretKey::generate(&mut rng)
}

pub fn bytes_to_secret_key(bytes: [u8; KEY_LENGTH]) -> SecretKey {
    SecretKey::from(bytes)
}

pub fn random_bytes(bytes_length: usize) -> Vec<u8> {
    let mut rand_bytes = vec![0; bytes_length];
    OsRng.fill_bytes(&mut rand_bytes);

    rand_bytes
}

pub fn box_message(
    plaintext: String,
    sender_secret_key: [u8; KEY_LENGTH],
    recipient_public_key: [u8; KEY_LENGTH],
) -> Result<(Vec<u8>, Vec<u8>), IronfishError> {
    let mut rng = OsRng;

    let sender: SecretKey = SecretKey::from(sender_secret_key);
    let recipient: PublicKey = PublicKey::from(recipient_public_key);

    let nonce = SalsaBox::generate_nonce(&mut rng);

    let key_box = SalsaBox::new(&recipient, &sender);

    let ciphertext = key_box.encrypt(&nonce, plaintext.as_bytes())?;

    Ok((nonce.to_vec(), ciphertext))
}

pub fn unbox_message(
    boxed_message: &[u8],
    nonce: &[u8],
    sender_public_key: [u8; KEY_LENGTH],
    recipient_secret_key: [u8; KEY_LENGTH],
) -> Result<String, IronfishError> {
    if nonce.len() != NONCE_LENGTH {
        return Err(IronfishError::new(IronfishErrorKind::InvalidNonceLength));
    }

    let nonce = GenericArray::from_slice(nonce);

    let recipient: SecretKey = SecretKey::from(recipient_secret_key);
    let sender: PublicKey = PublicKey::from(sender_public_key);

    let key_box = SalsaBox::new(&sender, &recipient);

    let cleartext_bytes = key_box.decrypt(nonce, boxed_message)?;

    String::from_utf8(cleartext_bytes).map_err(Into::into)
}

#[cfg(test)]
mod test {
    use super::{box_message, bytes_to_secret_key, new_secret_key, random_bytes, unbox_message};

    #[test]
    fn test_secret_key() {
        let key = new_secret_key();
        let key2 = bytes_to_secret_key(key.to_bytes());

        assert_eq!(key.to_bytes(), key2.to_bytes());
    }

    #[test]
    fn test_random_bytes() {
        let byte_length = 10;
        let empty_bytes = vec![0; byte_length];
        let bytes1 = random_bytes(byte_length);
        let bytes2 = random_bytes(byte_length);

        assert_eq!(bytes1.len(), byte_length);
        assert_eq!(bytes2.len(), byte_length);
        assert_ne!(bytes1, bytes2);
        assert_ne!(empty_bytes, bytes1);
        assert_ne!(empty_bytes, bytes2);
    }

    #[test]
    fn test_box_unbox() {
        let plaintext = "Hello hello hello".to_owned();

        let secret1 = new_secret_key();
        let public1 = secret1.public_key();

        let secret2 = new_secret_key();
        let public2 = secret2.public_key();

        let secret3 = new_secret_key();

        let (nonce, boxed_message) =
            box_message(plaintext.clone(), secret1.to_bytes(), public2.to_bytes())
                .expect("Can box message");

        let unboxed_message = unbox_message(
            &boxed_message,
            &nonce,
            public1.to_bytes(),
            secret2.to_bytes(),
        )
        .expect("Can unbox message");

        let failed_unbox = unbox_message(
            &boxed_message,
            &nonce,
            public1.to_bytes(),
            secret3.to_bytes(),
        );

        assert_eq!(plaintext, unboxed_message);
        assert!(failed_unbox.is_err());
    }
}
