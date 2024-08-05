use argon2::{password_hash::SaltString, Argon2};
use chacha20poly1305::aead::Aead;
use chacha20poly1305::{Key, KeyInit, XChaCha20Poly1305, XNonce};
use rand::{thread_rng, RngCore};

use crate::errors::{IronfishError, IronfishErrorKind};

const KEY_LENGTH: usize = 32;
const NONCE_LENGTH: usize = 24;

pub struct EncryptOutput {
    pub salt: SaltString,

    pub nonce: [u8; NONCE_LENGTH],

    pub ciphertext: Vec<u8>,
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
    let key = derive_key(passphrase, salt.to_string().as_bytes())?;

    let cipher = XChaCha20Poly1305::new(&key);
    let mut nonce_bytes = [0u8; 24];
    thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = XNonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| IronfishError::new(IronfishErrorKind::FailedXChaCha20Poly1305Encryption))?;

    Ok(EncryptOutput {
        salt,
        nonce: nonce_bytes,
        ciphertext,
    })
}

pub fn decrypt(
    encrypted_output: EncryptOutput,
    passphrase: &[u8],
) -> Result<Vec<u8>, IronfishError> {
    let nonce = XNonce::from_slice(&encrypted_output.nonce);

    let key = derive_key(passphrase, encrypted_output.salt.to_string().as_bytes())?;
    let cipher = XChaCha20Poly1305::new(&key);

    cipher
        .decrypt(nonce, encrypted_output.ciphertext.as_ref())
        .map_err(|_| IronfishError::new(IronfishErrorKind::FailedXChaCha20Poly1305Decryption))
}

#[cfg(test)]
mod test {
    use crate::xchacha20poly1305::{decrypt, encrypt};

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
}
