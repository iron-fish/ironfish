/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish::{
    nacl::{self, box_message, bytes_to_secret_key, new_secret_key, unbox_message},
    serializing::hex_to_bytes,
};
use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::to_napi_err;

#[napi]
pub const KEY_LENGTH: u32 = nacl::KEY_LENGTH as u32;

#[napi]
pub const NONCE_LENGTH: u32 = nacl::NONCE_LENGTH as u32;

#[napi]
pub struct BoxKeyPair {
    public_key: Vec<u8>,
    secret_key: Vec<u8>,
}

#[napi]
impl BoxKeyPair {
    #[napi(constructor)]
    #[allow(clippy::new_without_default)]
    pub fn new() -> BoxKeyPair {
        let secret_key = new_secret_key();

        BoxKeyPair {
            public_key: secret_key.public_key().as_bytes().to_vec(),
            secret_key: secret_key.to_bytes().to_vec(),
        }
    }

    #[napi(factory)]
    pub fn from_hex(secret_hex: String) -> Result<BoxKeyPair> {
        let bytes: [u8; nacl::KEY_LENGTH] =
            hex_to_bytes(&secret_hex).map_err(|_| to_napi_err("Unable to decode secret key"))?;

        let secret_key = bytes_to_secret_key(bytes);

        Ok(BoxKeyPair {
            public_key: secret_key.public_key().as_bytes().to_vec(),
            secret_key: secret_key.to_bytes().to_vec(),
        })
    }

    #[napi(getter)]
    pub fn public_key(&self) -> Buffer {
        Buffer::from(self.public_key.as_ref())
    }

    #[napi(getter)]
    pub fn secret_key(&self) -> Buffer {
        Buffer::from(self.secret_key.as_ref())
    }
}

#[napi]
pub fn random_bytes(bytes_length: u32) -> Uint8Array {
    Uint8Array::new(nacl::random_bytes(bytes_length as usize))
}

#[napi(object)]
pub struct BoxedMessage {
    pub nonce: String,
    pub boxed_message: String,
}

#[napi(js_name = "boxMessage")]
pub fn native_box_message(
    plaintext: String,
    sender_secret_key: Uint8Array,
    recipient_public_key: String,
) -> Result<BoxedMessage> {
    let sender: [u8; 32] = sender_secret_key
        .to_vec()
        .try_into()
        .map_err(|_| to_napi_err("Unable to convert sender secret key"))?;

    let decoded_recipient = base64::decode(recipient_public_key)
        .map_err(|_| to_napi_err("Unable to decode recipient public key"))?;

    let recipient: [u8; 32] = decoded_recipient
        .try_into()
        .map_err(|_| to_napi_err("Unable to convert recipient public key"))?;

    let (nonce, ciphertext) = box_message(plaintext, sender, recipient)
        .map_err(|_| to_napi_err("Unable to box message"))?;

    Ok(BoxedMessage {
        nonce: base64::encode(nonce),
        boxed_message: base64::encode(ciphertext),
    })
}

#[napi(js_name = "unboxMessage")]
pub fn native_unbox_message(
    boxed_message: String,
    nonce: String,
    sender_public_key: String,
    recipient_secret_key: Uint8Array,
) -> Result<String> {
    let decoded_sender = base64::decode(sender_public_key)
        .map_err(|_| to_napi_err("Unable to decode sender public key"))?;

    let sender: [u8; 32] = decoded_sender
        .try_into()
        .map_err(|_| to_napi_err("Unable to convert sender public key"))?;

    let recipient: [u8; 32] = recipient_secret_key
        .to_vec()
        .try_into()
        .map_err(|_| to_napi_err("Unable to convert recipient secret key"))?;

    let decoded_nonce = base64::decode(nonce).map_err(|_| to_napi_err("Unable to decode nonce"))?;

    let decoded_ciphertext =
        base64::decode(boxed_message).map_err(|_| to_napi_err("Unable to decode boxed_message"))?;

    unbox_message(&decoded_ciphertext, &decoded_nonce, sender, recipient)
        .map_err(|e| to_napi_err(format!("Unable to unbox message: {}", e)))
}
