use ironfish::serializing::{bytes_to_hex, hex_to_bytes};
use napi::bindgen_prelude::*;
use napi_derive::napi;

use std::str::FromStr;

use chacha20poly1305::aead::{Aead};
use chacha20poly1305::{Key, KeyInit, XChaCha20Poly1305, XNonce};
use pbkdf2::{
    password_hash::{
        PasswordHasher, SaltString, Salt
    },
    Params,
    Pbkdf2
};
use rand::thread_rng;

const PBKDF2_ITERATIONS: u32 = 100_000;
const KEY_LENGTH: usize = 32; // 256-bit key

fn derive_key(passphrase: String, salt: String) -> Key {
    let mut key = [0u8; KEY_LENGTH];
    let params_string = password_hash::ParamsString::from_str(format!("i={}", PBKDF2_ITERATIONS).as_str()).unwrap();
    let params = Params {
        output_length: 32,
       rounds: PBKDF2_ITERATIONS, 
    };

    let output = Pbkdf2.hash_password_customized(passphrase.as_bytes(), None, None, params, Salt::from_b64(&salt).unwrap())
        .unwrap()
        .hash
        .unwrap()
        .as_bytes()
        .fill(&mut key)
        .unwrap();

    output.as_bytes().fill(&mut key);
    // key[0..32].fill(&mut output.as_bytes()[..]);
    
    Key::from(key)
}

#[napi(object)]
pub struct EncryptResult {
    pub salt: String,
    pub nonce: String,
    pub ciphertext: String,
}

#[napi]
fn encrypt(passphrase: String, plaintext: String) -> EncryptResult {
    let salt = SaltString::generate(&mut thread_rng());
    let key = derive_key(passphrase, salt.to_string());
    
    let cipher = XChaCha20Poly1305::new(&key);
    let nonce = XNonce::from_slice(&[0u8; 24]);

    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).expect("encryption failure!");

    EncryptResult {
        salt: salt.to_string(),
        nonce: bytes_to_hex(&nonce.to_vec()[..]),
        ciphertext: bytes_to_hex(&ciphertext[..]),
    }
}

#[napi]
fn decrypt(passphrase: String, salt_hex: String, nonce_hex: String, ciphertext_hex: String) -> Vec<u8> {
    let salt = hex_to_bytes(&salt_hex).unwrap();
    let nonce = XNonce::from_slice(&hex_to_bytes(&nonce_hex).unwrap());
    let ciphertext = hex_to_bytes(&ciphertext_hex).unwrap();

    let key = derive_key(passphrase, salt_hex);
    
    let cipher = XChaCha20Poly1305::new(&key);
    cipher.decrypt(nonce, ciphertext.as_ref()).expect("decryption failure!")
}
