use ironfish::serializing::{bytes_to_hex, hex_to_bytes, hex_to_vec_bytes};
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

    let hash = Pbkdf2.hash_password_customized(passphrase.as_bytes(), None, None, params, Salt::from_b64(&salt).unwrap())
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
    let nonce = XNonce::from_slice(&[0u8; 24]);

    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).expect("encryption failure!");

    EncryptResult {
        salt: bytes_to_hex(salt.as_str().as_bytes()),
        nonce: bytes_to_hex(&nonce.to_vec()[..]),
        ciphertext: bytes_to_hex(&ciphertext[..]),
    }
}

#[napi]
pub fn decrypt(passphrase: String, salt_hex: String, nonce_hex: String, ciphertext_hex: String) -> String {
    let salt = hex_to_vec_bytes(&salt_hex).unwrap();
    let nonce_vec = &hex_to_vec_bytes(&nonce_hex).unwrap();
    let nonce = XNonce::from_slice(nonce_vec);
    let ciphertext = hex_to_vec_bytes(&ciphertext_hex).unwrap();

    let key = derive_key(passphrase, bytes_to_hex(&salt[..]));
    
    let cipher = XChaCha20Poly1305::new(&key);
    
    match cipher.decrypt(nonce, ciphertext.as_ref()) {
        Ok(decrypted) => {
            bytes_to_hex(&decrypted[..])
        }
        Err(err) => {
            eprintln!("Decryption failed: {:?}", err);
            eprintln!("Decryption failed: {:?}", err);
            eprintln!("Decryption failed: {:?}", err);
            eprintln!("Decryption failed: {:?}", err);

            bytes_to_hex("".as_bytes())
        }
    }
}
