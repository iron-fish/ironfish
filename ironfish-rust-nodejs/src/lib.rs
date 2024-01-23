/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish::frost::Identifier;
use ironfish::frost_utils::split_spender_key::split_spender_key;
use ironfish::serializing::bytes_to_hex;
use ironfish::serializing::hex_to_bytes;
use std::collections::HashMap;
use std::fmt::Display;

use ironfish::keys::Language;
use ironfish::keys::ProofGenerationKeySerializable;
use ironfish::PublicAddress;
use ironfish::SaplingKey;

use ironfish::util::str_to_array;
use napi::bindgen_prelude::*;
use napi_derive::napi;

use ironfish::mining;
use ironfish::sapling_bls12;
use structs::TrustedDealerKeyPackages;

pub mod fish_hash;
pub mod frost;
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
    pub spending_key: String,
    pub view_key: String,
    pub incoming_view_key: String,
    pub outgoing_view_key: String,
    pub public_address: String,
    pub proof_generation_key: String,
}

#[napi]
pub fn split_secret(
    coordinator_sapling_key: String,
    min_signers: u16,
    max_signers: u16,
    identifiers: Vec<String>,
) -> Result<TrustedDealerKeyPackages> {
    let coordinator_key =
        SaplingKey::new(str_to_array(&coordinator_sapling_key)).map_err(to_napi_err)?;

    let mut converted = Vec::new();

    for identifier in &identifiers {
        let bytes = hex_to_bytes(identifier).map_err(to_napi_err)?;
        let deserialized = Identifier::deserialize(&bytes).map_err(to_napi_err)?;
        converted.push(deserialized);
    }

    let t = split_spender_key(&coordinator_key, min_signers, max_signers, converted)
        .map_err(to_napi_err)?;

    let mut key_packages_serialized = HashMap::new();
    for (k, v) in t.key_packages.iter() {
        key_packages_serialized.insert(
            bytes_to_hex(&k.serialize()),
            bytes_to_hex(&v.serialize().map_err(to_napi_err)?),
        );
    }

    let public_key_package = t.public_key_package.serialize().map_err(to_napi_err)?;

    Ok(TrustedDealerKeyPackages {
        verifying_key: bytes_to_hex(&t.verifying_key),
        proof_generation_key: t.proof_generation_key.hex_key(),
        view_key: t.view_key.hex_key(),
        incoming_view_key: t.incoming_view_key.hex_key(),
        outgoing_view_key: t.outgoing_view_key.hex_key(),
        public_address: t.public_address.hex_public_address(),
        key_packages: key_packages_serialized,
        public_key_package: bytes_to_hex(&public_key_package),
    })
}

#[napi]
pub fn generate_key() -> Key {
    let sapling_key = SaplingKey::generate_key();

    Key {
        spending_key: sapling_key.hex_spending_key(),
        view_key: sapling_key.view_key().hex_key(),
        incoming_view_key: sapling_key.incoming_view_key().hex_key(),
        outgoing_view_key: sapling_key.outgoing_view_key().hex_key(),
        public_address: sapling_key.public_address().hex_public_address(),
        proof_generation_key: sapling_key.sapling_proof_generation_key().hex_key(),
    }
}

#[napi]
pub fn spending_key_to_words(private_key: String, language_code: LanguageCode) -> Result<String> {
    let key = SaplingKey::from_hex(&private_key).map_err(to_napi_err)?;
    let mnemonic = key.to_words(language_code.into()).map_err(to_napi_err)?;
    Ok(mnemonic.into_phrase())
}

#[napi]
pub fn words_to_spending_key(words: String, language_code: LanguageCode) -> Result<String> {
    let key = SaplingKey::from_words(words, language_code.into()).map_err(to_napi_err)?;
    Ok(key.hex_spending_key())
}

#[napi]
pub fn generate_key_from_private_key(private_key: String) -> Result<Key> {
    let sapling_key = SaplingKey::from_hex(&private_key).map_err(to_napi_err)?;

    Ok(Key {
        spending_key: sapling_key.hex_spending_key(),
        view_key: sapling_key.view_key().hex_key(),
        incoming_view_key: sapling_key.incoming_view_key().hex_key(),
        outgoing_view_key: sapling_key.outgoing_view_key().hex_key(),
        public_address: sapling_key.public_address().hex_public_address(),
        proof_generation_key: sapling_key.sapling_proof_generation_key().hex_key(),
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
pub fn is_valid_public_address(hex_address: String) -> bool {
    PublicAddress::from_hex(&hex_address).is_ok()
}
