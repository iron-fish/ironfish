/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish_rust::tweetnacl::{box_message, bytes_to_secret_key, new_secret_key, unbox_message};
use ironfish_rust::SaplingKey;
use ironfish_rust::{base64, tweetnacl};
use napi::bindgen_prelude::*;
use napi::Error;
use napi_derive::napi;

use ironfish_rust::mining;
use ironfish_rust::sapling_bls12;

pub mod structs;

#[napi(object)]
pub struct Key {
    #[napi(js_name = "spending_key")]
    pub spending_key: String,
    #[napi(js_name = "incoming_view_key")]
    pub incoming_view_key: String,
    #[napi(js_name = "outgoing_view_key")]
    pub outgoing_view_key: String,
    #[napi(js_name = "public_address")]
    pub public_address: String,
}

#[napi]
pub fn generate_key() -> Key {
    let sapling_key = SaplingKey::generate_key();

    Key {
        spending_key: sapling_key.hex_spending_key(),
        incoming_view_key: sapling_key.incoming_view_key().hex_key(),
        outgoing_view_key: sapling_key.outgoing_view_key().hex_key(),
        public_address: sapling_key.generate_public_address().hex_public_address(),
    }
}

#[napi]
pub fn generate_new_public_address(private_key: String) -> Result<Key> {
    let sapling_key =
        SaplingKey::from_hex(&private_key).map_err(|err| Error::from_reason(err.to_string()))?;

    Ok(Key {
        spending_key: sapling_key.hex_spending_key(),
        incoming_view_key: sapling_key.incoming_view_key().hex_key(),
        outgoing_view_key: sapling_key.outgoing_view_key().hex_key(),
        public_address: sapling_key.generate_public_address().hex_public_address(),
    })
}

#[napi]
pub fn initialize_sapling() {
    let _ = sapling_bls12::SAPLING.clone();
}

#[napi(constructor)]
pub struct FoundBlockResult {
    pub randomness: String,
    pub mining_request_id: f64,
}

#[napi]
struct ThreadPoolHandler {
    #[allow(dead_code)]
    threadpool: mining::threadpool::ThreadPool,
}
#[napi]
impl ThreadPoolHandler {
    #[napi(constructor)]
    #[allow(dead_code)]
    pub fn new(thread_count: u32, batch_size: u32) -> Self {
        ThreadPoolHandler {
            threadpool: mining::threadpool::ThreadPool::new(thread_count as usize, batch_size),
        }
    }

    #[napi]
    #[allow(dead_code)]
    pub fn new_work(&mut self, header_bytes: Buffer, target: Buffer, mining_request_id: u32) {
        self.threadpool
            .new_work(&header_bytes, &target, mining_request_id)
    }

    #[napi]
    #[allow(dead_code)]
    pub fn stop(&self) {
        self.threadpool.stop()
    }

    #[napi]
    #[allow(dead_code)]
    pub fn pause(&self) {
        self.threadpool.pause()
    }

    #[napi]
    #[allow(dead_code)]
    pub fn get_found_block(&self) -> Option<FoundBlockResult> {
        if let Some(result) = self.threadpool.get_found_block() {
            return Some(FoundBlockResult {
                randomness: format!("{:016x}", result.0),
                mining_request_id: result.1 as f64,
            });
        }
        None
    }

    #[napi]
    #[allow(dead_code)]
    pub fn get_hash_rate_submission(&self) -> u32 {
        self.threadpool.get_hash_rate_submission()
    }
}

#[napi]
pub const KEY_LENGTH: u32 = tweetnacl::KEY_LENGTH as u32;

#[napi]
pub const NONCE_LENGTH: u32 = tweetnacl::NONCE_LENGTH as u32;

#[napi]
pub struct BoxKeyPair {
    pub public_key: Uint8Array,
    pub secret_key: Uint8Array,
}

#[napi]
impl BoxKeyPair {
    #[napi(constructor)]
    pub fn new() -> BoxKeyPair {
        let secret_key = new_secret_key();

        BoxKeyPair {
            public_key: Uint8Array::new(secret_key.public_key().as_bytes().to_vec()),
            secret_key: Uint8Array::new(secret_key.as_bytes().to_vec()),
        }
    }

    #[napi(factory)]
    pub fn from_hex(secret_hex: String) -> Result<BoxKeyPair> {
        let byte_vec = base64::decode(secret_hex)
            .map_err(|_| Error::from_reason("Unable to decode secret key".to_owned()))?;

        let bytes: [u8; tweetnacl::KEY_LENGTH] = byte_vec
            .try_into()
            .map_err(|_| Error::from_reason("Unable to convert secret key".to_owned()))?;

        let secret_key = bytes_to_secret_key(bytes);

        Ok(BoxKeyPair {
            public_key: Uint8Array::new(secret_key.public_key().as_bytes().to_vec()),
            secret_key: Uint8Array::new(secret_key.as_bytes().to_vec()),
        })
    }
}

#[napi]
pub fn random_bytes(bytes_length: u32) -> Uint8Array {
    Uint8Array::new(tweetnacl::random_bytes(bytes_length as usize))
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
        .map_err(|_| Error::from_reason("Unable to convert sender secret key".to_owned()))?;

    let decoded_recipient = base64::decode(recipient_public_key)
        .map_err(|_| Error::from_reason("Unable to decode recipient public key".to_owned()))?;

    let recipient: [u8; 32] = decoded_recipient
        .try_into()
        .map_err(|_| Error::from_reason("Unable to convert recipient public key".to_owned()))?;

    let (nonce, ciphertext) = box_message(plaintext, sender, recipient)
        .map_err(|_| Error::from_reason("Unable to box message".to_owned()))?;

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
        .map_err(|_| Error::from_reason("Unable to decode sender public key".to_owned()))?;

    let sender: [u8; 32] = decoded_sender
        .try_into()
        .map_err(|_| Error::from_reason("Unable to convert sender pubic key".to_owned()))?;

    let recipient: [u8; 32] = recipient_secret_key
        .to_vec()
        .try_into()
        .map_err(|_| Error::from_reason("Unable to convert recipient secret key".to_owned()))?;

    let decoded_nonce = base64::decode(nonce)
        .map_err(|_| Error::from_reason("Unable to decode nonce".to_owned()))?;

    let decoded_ciphertext = base64::decode(boxed_message)
        .map_err(|_| Error::from_reason("Unable to decode boxed_message".to_owned()))?;

    unbox_message(&decoded_ciphertext, &decoded_nonce, sender, recipient)
        .map_err(|e| Error::from_reason(format!("Unable to unbox message: {}", e)))
}
