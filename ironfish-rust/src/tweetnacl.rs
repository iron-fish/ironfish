use std::error::Error;

use crypto_box::{
    aead::{generic_array::GenericArray, Aead},
    PublicKey, SecretKey,
};

use crate::errors::StringError;

pub fn box_message(
    plaintext: String,
    sender_secret_key: [u8; 32],
    recipient_public_key: [u8; 32],
) -> Result<(Vec<u8>, Vec<u8>), Box<dyn Error>> {
    let mut rng = crypto_box::rand_core::OsRng;

    let sender: SecretKey = SecretKey::from(sender_secret_key);
    let recipient: PublicKey = PublicKey::from(recipient_public_key);

    let nonce = crypto_box::generate_nonce(&mut rng);

    let key_box = crypto_box::Box::new(&recipient, &sender);

    let ciphertext = key_box.encrypt(&nonce, plaintext.as_bytes())?;

    Ok((nonce.to_vec(), ciphertext))
}

pub fn unbox_message(
    boxed_message: &[u8],
    nonce: &[u8],
    sender_public_key: [u8; 32],
    recipient_secret_key: [u8; 32],
) -> Result<String, Box<dyn Error>> {
    if nonce.len() != 24 {
        return Err(Box::new(StringError(
            "Nonce length is incorrect".to_owned(),
        )));
    }

    let nonce = GenericArray::from_slice(nonce);

    let recipient: SecretKey = SecretKey::from(recipient_secret_key);
    let sender: PublicKey = PublicKey::from(sender_public_key);

    let key_box = crypto_box::Box::new(&sender, &recipient);

    let cleartext_bytes = key_box.decrypt(nonce, boxed_message)?;

    String::from_utf8(cleartext_bytes).map_err(Into::into)
}
