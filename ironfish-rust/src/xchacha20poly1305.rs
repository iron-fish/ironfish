/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::io;

use argon2::{password_hash::SaltString, Argon2};
use chacha20poly1305::aead::Aead;
use chacha20poly1305::{Key, KeyInit, XChaCha20Poly1305, XNonce};
use rand::{thread_rng, RngCore};

use crate::errors::{IronfishError, IronfishErrorKind};

const KEY_LENGTH: usize = 32;
const NONCE_LENGTH: usize = 24;

#[derive(Debug)]
pub struct EncryptOutput {
    pub salt: Vec<u8>,

    pub nonce: [u8; NONCE_LENGTH],

    pub ciphertext: Vec<u8>,
}

impl EncryptOutput {
    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        let salt_len = u32::try_from(self.salt.len())?.to_le_bytes();
        writer.write_all(&salt_len)?;
        writer.write_all(&self.salt)?;

        writer.write_all(&self.nonce)?;

        let ciphertext_len = u32::try_from(self.ciphertext.len())?.to_le_bytes();
        writer.write_all(&ciphertext_len)?;
        writer.write_all(&self.ciphertext)?;

        Ok(())
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let mut salt_len = [0u8; 4];
        reader.read_exact(&mut salt_len)?;
        let salt_len = u32::from_le_bytes(salt_len) as usize;

        let mut salt = vec![0u8; salt_len];
        reader.read_exact(&mut salt)?;

        let mut nonce = [0u8; NONCE_LENGTH];
        reader.read_exact(&mut nonce)?;

        let mut ciphertext_len = [0u8; 4];
        reader.read_exact(&mut ciphertext_len)?;
        let ciphertext_len = u32::from_le_bytes(ciphertext_len) as usize;

        let mut ciphertext = vec![0u8; ciphertext_len];
        reader.read_exact(&mut ciphertext)?;

        Ok(EncryptOutput {
            salt,
            nonce,
            ciphertext,
        })
    }
}

impl PartialEq for EncryptOutput {
    fn eq(&self, other: &EncryptOutput) -> bool {
        self.salt == other.salt && self.nonce == other.nonce && self.ciphertext == other.ciphertext
    }
}

fn derive_key(passphrase: &[u8], salt: &[u8]) -> Result<Key, IronfishError> {
    let mut key = [0u8; KEY_LENGTH];
    let argon2 = Argon2::default();

    argon2
        .hash_password_into(passphrase, salt, &mut key)
        .map_err(|_| IronfishError::new(IronfishErrorKind::FailedArgon2Hash))?;

    Ok(Key::from(key))
}

pub fn encrypt(plaintext: &[u8], passphrase: &[u8]) -> Result<EncryptOutput, IronfishError> {
    let salt = SaltString::generate(&mut thread_rng());
    let salt_str = salt.to_string();
    let salt_bytes = salt_str.as_bytes();
    let key = derive_key(passphrase, salt_bytes)?;

    let cipher = XChaCha20Poly1305::new(&key);
    let mut nonce_bytes = [0u8; NONCE_LENGTH];
    thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = XNonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| IronfishError::new(IronfishErrorKind::FailedXChaCha20Poly1305Encryption))?;

    Ok(EncryptOutput {
        salt: salt_bytes.to_vec(),
        nonce: nonce_bytes,
        ciphertext,
    })
}

pub fn decrypt(
    encrypted_output: EncryptOutput,
    passphrase: &[u8],
) -> Result<Vec<u8>, IronfishError> {
    let nonce = XNonce::from_slice(&encrypted_output.nonce);

    let key = derive_key(passphrase, &encrypted_output.salt[..])?;
    let cipher = XChaCha20Poly1305::new(&key);

    cipher
        .decrypt(nonce, encrypted_output.ciphertext.as_ref())
        .map_err(|_| IronfishError::new(IronfishErrorKind::FailedXChaCha20Poly1305Decryption))
}

#[cfg(test)]
mod test {
    use crate::xchacha20poly1305::{decrypt, encrypt};

    use super::EncryptOutput;

    #[test]
    fn test_valid_passphrase() {
        let plaintext = "thisissensitivedata";
        let passphrase = "supersecretpassword";

        let encrypted_output = encrypt(plaintext.as_bytes(), passphrase.as_bytes())
            .expect("should successfully encrypt");
        let decrypted =
            decrypt(encrypted_output, passphrase.as_bytes()).expect("should decrypt successfully");

        assert_eq!(decrypted, plaintext.as_bytes());
    }

    #[test]
    fn test_invalid_passphrase() {
        let plaintext = "thisissensitivedata";
        let passphrase = "supersecretpassword";
        let incorrect_passphrase = "foobar";

        let encrypted_output = encrypt(plaintext.as_bytes(), passphrase.as_bytes())
            .expect("should successfully encrypt");

        decrypt(encrypted_output, incorrect_passphrase.as_bytes())
            .expect_err("should fail decryption");
    }

    #[test]
    fn test_encrypt_output_serialization() {
        let plaintext = "thisissensitivedata";
        let passphrase = "supersecretpassword";

        let encrypted_output = encrypt(plaintext.as_bytes(), passphrase.as_bytes())
            .expect("should successfully encrypt");

        let mut vec: Vec<u8> = vec![];
        encrypted_output
            .write(&mut vec)
            .expect("should serialize successfully");

        let deserialized = EncryptOutput::read(&vec[..]).expect("should deserialize successfully");

        assert_eq!(encrypted_output, deserialized);
    }
}
