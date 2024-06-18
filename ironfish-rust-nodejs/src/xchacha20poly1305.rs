use ironfish::serializing::{bytes_to_hex, hex_to_vec_bytes};
use napi_derive::napi;

use std::str::FromStr;

use chacha20poly1305::aead::Aead;
use chacha20poly1305::{Key, KeyInit, XChaCha20Poly1305, XNonce};
use pbkdf2::{
    password_hash::{PasswordHasher, Salt, SaltString},
    Params, Pbkdf2,
};
use rand::{thread_rng, RngCore};

const PBKDF2_ITERATIONS: u32 = 100_000;
const KEY_LENGTH: usize = 32; // 256-bit key

fn derive_key(passphrase: String, salt: String) -> Key {
    let mut key = [0u8; KEY_LENGTH];
    let params = Params {
        output_length: 32,
        rounds: PBKDF2_ITERATIONS,
    };

    let hash = Pbkdf2
        .hash_password_customized(
            passphrase.as_bytes(),
            None,
            None,
            params,
            Salt::from_b64(&salt).unwrap(),
        )
        .unwrap()
        .hash
        .unwrap();
    let hash_bytes = hash.as_bytes();

    key.copy_from_slice(&hash_bytes[..KEY_LENGTH]);

    Key::from(key)
}

#[napi(object)]
pub struct EncryptResult {
    pub salt: String,
    pub nonce: String,
    pub ciphertext: String,
}

#[napi]
pub fn encrypt(passphrase: String, plaintext: String) -> EncryptResult {
    let salt = SaltString::generate(&mut thread_rng());
    let key = derive_key(passphrase, salt.to_string());

    let cipher = XChaCha20Poly1305::new(&key);
    let mut nonce_bytes = [0u8; 24];
    thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = XNonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .expect("encryption failure!");

    EncryptResult {
        salt: String::from_str(salt.as_str()).unwrap(),
        nonce: bytes_to_hex(&nonce.to_vec()[..]),
        ciphertext: bytes_to_hex(&ciphertext[..]),
    }
}

#[napi]
pub fn decrypt(
    passphrase: String,
    salt_hex: String,
    nonce_hex: String,
    ciphertext_hex: String,
) -> String {
    let nonce_vec = &hex_to_vec_bytes(&nonce_hex).unwrap();
    let nonce = XNonce::from_slice(nonce_vec);
    let ciphertext = hex_to_vec_bytes(&ciphertext_hex).unwrap();

    let key = derive_key(passphrase, salt_hex);
    let cipher = XChaCha20Poly1305::new(&key);

    let decrypted = cipher.decrypt(nonce, ciphertext.as_ref()).unwrap();
    String::from_utf8(decrypted.to_vec()).unwrap()
}
