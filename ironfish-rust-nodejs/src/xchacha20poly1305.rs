use chacha20poly1305::aead::{Aead, NewAead};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
use password_hash::{PasswordHasher, SaltString};
use pbkdf2::{Pbkdf2, password_hash::PasswordHash};
use rand::thread_rng;

const PBKDF2_ITERATIONS: u32 = 100_000;
const KEY_LENGTH: usize = 32; // 256-bit key

#[napi]
fn derive_key(passphrase: &str, salt: &[u8]) -> Key {
    let mut key = [0u8; KEY_LENGTH];
    let params = password_hash::ParamsString::new(format!("i={}", PBKDF2_ITERATIONS).as_str()).unwrap();
    Pbkdf2.hash_password_customized(passphrase.as_bytes(), None, None, params, salt)
        .unwrap()
        .hash
        .unwrap()
        .fill(&mut key)
        .unwrap();
    Key::from_slice(&key)
}

#[napi]
fn encrypt(passphrase: &str, plaintext: &[u8]) -> (String, String, String) {
    let salt = SaltString::generate(&mut thread_rng());
    let key = derive_key(passphrase, salt.as_bytes());
    
    let cipher = ChaCha20Poly1305::new(&key);
    let nonce = Nonce::from_slice(&[0u8; 12]); // 96-bits; unique per message

    let ciphertext = cipher.encrypt(nonce, plaintext).expect("encryption failure!");

    (encode(salt.as_bytes()), encode(nonce), encode(&ciphertext))
}

#[napi]
fn decrypt(passphrase: &str, salt_hex: &str, nonce_hex: &str, ciphertext_hex: &str) -> Vec<u8> {
    let salt = hex::decode(salt_hex).expect("Invalid hex for salt");
    let nonce = Nonce::from_slice(&hex::decode(nonce_hex).expect("Invalid hex for nonce"));
    let ciphertext = hex::decode(ciphertext_hex).expect("Invalid hex for ciphertext");

    let key = derive_key(passphrase, &salt);
    
    let cipher = ChaCha20Poly1305::new(&key);
    cipher.decrypt(nonce, ciphertext.as_ref()).expect("decryption failure!")
}
