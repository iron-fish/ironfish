/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::io;

use argon2::Argon2;
use argon2::RECOMMENDED_SALT_LEN;
use chacha20poly1305::aead::Aead;
use chacha20poly1305::{Key, KeyInit, XChaCha20Poly1305, XNonce};
use hkdf::Hkdf;
use rand::{thread_rng, RngCore};
use sha2::Sha256;

use crate::errors::{IronfishError, IronfishErrorKind};

pub const KEY_LENGTH: usize = 32;
pub const SALT_LENGTH: usize = RECOMMENDED_SALT_LEN;
pub const XNONCE_LENGTH: usize = 24;

#[derive(Debug)]
pub struct XChaCha20Poly1305Key {
    pub key: [u8; KEY_LENGTH],

    pub nonce: [u8; XNONCE_LENGTH],

    pub salt: [u8; SALT_LENGTH],
}

impl XChaCha20Poly1305Key {
    pub fn generate(passphrase: &[u8]) -> Result<XChaCha20Poly1305Key, IronfishError> {
        let mut nonce = [0u8; XNONCE_LENGTH];
        thread_rng().fill_bytes(&mut nonce);

        let mut salt = [0u8; SALT_LENGTH];
        thread_rng().fill_bytes(&mut salt);

        XChaCha20Poly1305Key::from_parts(passphrase, salt, nonce)
    }

    pub fn from_parts(
        passphrase: &[u8],
        salt: [u8; SALT_LENGTH],
        nonce: [u8; XNONCE_LENGTH],
    ) -> Result<XChaCha20Poly1305Key, IronfishError> {
        let mut key = [0u8; KEY_LENGTH];
        let argon2 = Argon2::default();

        argon2
            .hash_password_into(passphrase, &salt, &mut key)
            .map_err(|_| IronfishError::new(IronfishErrorKind::FailedArgon2Hash))?;

        Ok(XChaCha20Poly1305Key { key, salt, nonce })
    }

    pub fn derive_key(&self, salt: [u8; SALT_LENGTH]) -> Result<[u8; KEY_LENGTH], IronfishError> {
        let hkdf = Hkdf::<Sha256>::new(None, &self.key);

        let mut okm = [0u8; KEY_LENGTH];
        hkdf.expand(&salt, &mut okm)
            .map_err(|_| IronfishError::new(IronfishErrorKind::FailedHkdfExpansion))?;

        Ok(okm)
    }

    pub fn derive_new_key(&self) -> Result<XChaCha20Poly1305Key, IronfishError> {
        let mut nonce = [0u8; XNONCE_LENGTH];
        thread_rng().fill_bytes(&mut nonce);

        let mut salt = [0u8; SALT_LENGTH];
        thread_rng().fill_bytes(&mut salt);

        let hkdf = Hkdf::<Sha256>::new(None, &self.key);

        let mut okm = [0u8; KEY_LENGTH];
        hkdf.expand(&salt, &mut okm)
            .map_err(|_| IronfishError::new(IronfishErrorKind::FailedHkdfExpansion))?;

        Ok(XChaCha20Poly1305Key {
            key: okm,
            salt,
            nonce,
        })
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let mut salt = [0u8; SALT_LENGTH];
        reader.read_exact(&mut salt)?;

        let mut nonce = [0u8; XNONCE_LENGTH];
        reader.read_exact(&mut nonce)?;

        let mut key = [0u8; KEY_LENGTH];
        reader.read_exact(&mut key)?;

        Ok(XChaCha20Poly1305Key { salt, nonce, key })
    }

    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        writer.write_all(&self.salt)?;
        writer.write_all(&self.nonce)?;
        writer.write_all(&self.key)?;

        Ok(())
    }

    pub fn destroy(&mut self) {
        self.key.fill(0);
        self.nonce.fill(0);
        self.salt.fill(0);
    }

    pub fn encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>, IronfishError> {
        let nonce = XNonce::from_slice(&self.nonce);
        let key = Key::from(self.key);
        let cipher = XChaCha20Poly1305::new(&key);

        let ciphertext = cipher.encrypt(nonce, plaintext).map_err(|_| {
            IronfishError::new(IronfishErrorKind::FailedXChaCha20Poly1305Encryption)
        })?;

        Ok(ciphertext)
    }

    pub fn decrypt(&self, ciphertext: Vec<u8>) -> Result<Vec<u8>, IronfishError> {
        let nonce = XNonce::from_slice(&self.nonce);
        let key = Key::from(self.key);
        let cipher = XChaCha20Poly1305::new(&key);

        cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|_| IronfishError::new(IronfishErrorKind::FailedXChaCha20Poly1305Decryption))
    }
}

#[cfg(test)]
mod test {
    use crate::xchacha20poly1305::XChaCha20Poly1305Key;

    #[test]
    fn test_valid_passphrase() {
        let plaintext = "thisissensitivedata";
        let passphrase = "supersecretpassword";

        let key =
            XChaCha20Poly1305Key::generate(passphrase.as_bytes()).expect("should generate key");

        let encrypted_output = key
            .encrypt(plaintext.as_bytes())
            .expect("should successfully encrypt");
        let decrypted = key
            .decrypt(encrypted_output)
            .expect("should decrypt successfully");

        assert_eq!(decrypted, plaintext.as_bytes());
    }

    #[test]
    fn test_invalid_passphrase() {
        let plaintext = "thisissensitivedata";
        let passphrase = "supersecretpassword";
        let incorrect_passphrase = "foobar";

        let key =
            XChaCha20Poly1305Key::generate(passphrase.as_bytes()).expect("should generate key");

        let encrypted_output = key
            .encrypt(plaintext.as_bytes())
            .expect("should successfully encrypt");

        let incorrect_key = XChaCha20Poly1305Key::generate(incorrect_passphrase.as_bytes())
            .expect("should generate key");

        incorrect_key
            .decrypt(encrypted_output)
            .expect_err("should fail decryption");
    }

    #[test]
    fn test_derive_key() {
        let passphrase = "supersecretpassword";

        let encryption_key = XChaCha20Poly1305Key::generate(passphrase.as_bytes())
            .expect("should successfully generate key");

        let key = encryption_key.derive_new_key().expect("should derive key");
        let derived_key = encryption_key
            .derive_key(key.salt)
            .expect("should derive key");

        assert_eq!(key.key, derived_key);
    }
}
