/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::fmt::Display;

use ironfish_rust::keys::Language;
use ironfish_rust::keys::SPEND_KEY_SIZE;
use ironfish_rust::PublicAddress;
use ironfish_rust::SaplingKey;
use napi::bindgen_prelude::*;
use napi::JsBuffer;
use napi_derive::napi;

use ironfish_rust::mining;
use ironfish_rust::sapling_bls12;

pub mod mpc;
pub mod nacl;
pub mod rolling_filter;
pub mod signal_catcher;
pub mod structs;

fn to_napi_err(err: impl Display) -> napi::Error {
    Error::from_reason(err.to_string())
}

// unfortunately napi doesn't support reexport of enums (bip39::Language) so we
// have to recreate if we want type safety. hopefully in the future this will work with napi:
// #[napi]
// pub use bip39::Language as Language;
// https://github.com/napi-rs/napi-rs/issues/1463
#[napi]
pub enum LanguageCode {
    English,
    ChineseSimplified,
    ChineseTraditional,
    French,
    Italian,
    Japanese,
    Korean,
    Spanish,
}
impl From<LanguageCode> for Language {
    fn from(item: LanguageCode) -> Self {
        match item {
            LanguageCode::English => Language::English,
            LanguageCode::ChineseSimplified => Language::ChineseSimplified,
            LanguageCode::ChineseTraditional => Language::ChineseTraditional,
            LanguageCode::French => Language::French,
            LanguageCode::Italian => Language::Italian,
            LanguageCode::Japanese => Language::Japanese,
            LanguageCode::Korean => Language::Korean,
            LanguageCode::Spanish => Language::Spanish,
        }
    }
}

#[napi(object)]
pub struct Key {
    pub spending_key: Buffer,
    pub view_key: Buffer,
    pub incoming_view_key: Buffer,
    pub outgoing_view_key: Buffer,
    pub public_address: Buffer,
}

#[napi]
pub fn generate_key() -> Key {
    let sapling_key = SaplingKey::generate_key();

    Key {
        spending_key: Buffer::from(&sapling_key.spending_key()[..]),
        view_key: Buffer::from(&sapling_key.view_key().to_bytes()[..]),
        incoming_view_key: Buffer::from(&sapling_key.incoming_view_key().to_bytes()[..]),
        outgoing_view_key: Buffer::from(&sapling_key.outgoing_view_key().to_bytes()[..]),
        public_address: Buffer::from(&sapling_key.public_address().public_address()[..]),
    }
}

#[napi]
pub fn spending_key_to_words(private_key: JsBuffer, language_code: LanguageCode) -> Result<String> {
    let private_key_buffer = private_key.into_value()?;
    let private_key_vec = private_key_buffer.as_ref();
    let mut private_key_bytes = [0; SPEND_KEY_SIZE];
    private_key_bytes.clone_from_slice(&private_key_vec[0..SPEND_KEY_SIZE]);

    let key = SaplingKey::new(private_key_bytes).map_err(to_napi_err)?;
    let mnemonic = key.to_words(language_code.into()).map_err(to_napi_err)?;
    Ok(mnemonic.into_phrase())
}

#[napi]
pub fn words_to_spending_key(words: String, language_code: LanguageCode) -> Result<String> {
    let key = SaplingKey::from_words(words, language_code.into()).map_err(to_napi_err)?;
    Ok(key.hex_spending_key())
}

#[napi]
pub fn generate_key_from_private_key(private_key: JsBuffer) -> Result<Key> {
    let private_key_buffer = private_key.into_value()?;
    let private_key_vec = private_key_buffer.as_ref();
    let mut private_key_bytes = [0; SPEND_KEY_SIZE];
    private_key_bytes.clone_from_slice(&private_key_vec[0..SPEND_KEY_SIZE]);

    let sapling_key = SaplingKey::new(private_key_bytes).map_err(to_napi_err)?;

    Ok(Key {
        spending_key: Buffer::from(&sapling_key.spending_key()[..]),
        view_key: Buffer::from(&sapling_key.view_key().to_bytes()[..]),
        incoming_view_key: Buffer::from(&sapling_key.incoming_view_key().to_bytes()[..]),
        outgoing_view_key: Buffer::from(&sapling_key.outgoing_view_key().to_bytes()[..]),
        public_address: Buffer::from(&sapling_key.public_address().public_address()[..]),
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
pub struct ThreadPoolHandler {
    threadpool: mining::threadpool::ThreadPool,
}
#[napi]
impl ThreadPoolHandler {
    #[napi(constructor)]
    pub fn new(thread_count: u32, batch_size: u32, pause_on_success: bool) -> Self {
        ThreadPoolHandler {
            threadpool: mining::threadpool::ThreadPool::new(
                thread_count as usize,
                batch_size,
                pause_on_success,
            ),
        }
    }

    #[napi]
    pub fn new_work(&mut self, header_bytes: Buffer, target: Buffer, mining_request_id: u32) {
        self.threadpool
            .new_work(&header_bytes, &target, mining_request_id)
    }

    #[napi]
    pub fn stop(&self) {
        self.threadpool.stop()
    }

    #[napi]
    pub fn pause(&self) {
        self.threadpool.pause()
    }

    #[napi]
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
    pub fn get_hash_rate_submission(&self) -> u32 {
        self.threadpool.get_hash_rate_submission()
    }
}

#[napi]
pub fn is_valid_public_address(address: JsBuffer) -> Result<bool> {
    let address_buffer = address.into_value()?;
    let address_vec = address_buffer.as_ref();
    let mut address_bytes = [0; SPEND_KEY_SIZE];
    address_bytes.clone_from_slice(&address_vec[0..SPEND_KEY_SIZE]);

    Ok(PublicAddress::new(&address_bytes).is_ok())
}
