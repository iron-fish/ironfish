/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#![warn(clippy::dbg_macro)]
#![warn(clippy::print_stderr)]
#![warn(clippy::print_stdout)]
#![warn(unreachable_pub)]
#![warn(unused_crate_dependencies)]
#![warn(unused_macro_rules)]
#![warn(unused_qualifications)]

use std::fmt::Display;
use std::num::NonZeroUsize;

use ironfish::keys::generate_randomized_public_key;
use ironfish::keys::Language;
use ironfish::serializing::bytes_to_hex;
use ironfish::serializing::fr::FrSerializable;
use ironfish::IncomingViewKey;
use ironfish::PublicAddress;
use ironfish::SaplingKey;

use ironfish::ViewKey;
use napi::bindgen_prelude::*;
use napi_derive::napi;

use ironfish::mining;
use ironfish::sapling_bls12;

pub mod fish_hash;
pub mod multisig;
pub mod nacl;
pub mod rolling_filter;
pub mod signal_catcher;
pub mod structs;
pub mod xchacha20poly1305;

#[cfg(feature = "stats")]
pub mod stats;

fn to_napi_err(err: impl Display) -> Error {
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
    pub proof_authorizing_key: String,
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
        proof_authorizing_key: bytes_to_hex(
            &sapling_key.sapling_proof_generation_key().nsk.to_bytes(),
        ),
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
    let key = SaplingKey::from_words(&words, language_code.into()).map_err(to_napi_err)?;
    Ok(key.hex_spending_key())
}

#[napi]
pub fn generate_public_address_from_incoming_view_key(ivk_string: String) -> Result<String> {
    let ivk = IncomingViewKey::from_hex(&ivk_string).map_err(to_napi_err)?;
    let address = PublicAddress::from_view_key(&ivk);
    Ok(address.hex_public_address())
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
        proof_authorizing_key: bytes_to_hex(
            &sapling_key.sapling_proof_generation_key().nsk.to_bytes(),
        ),
    })
}

#[napi]
pub fn initialize_sapling() {
    // Deref the `SAPLING` lazy-static, to ensure it gets initialized
    let _ = &*sapling_bls12::SAPLING;
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
    pub fn new(
        thread_count: u32,
        batch_size: u32,
        pause_on_success: bool,
        use_fish_hash: bool,
        fish_hash_full_context: bool,
    ) -> Self {
        ThreadPoolHandler {
            threadpool: mining::threadpool::ThreadPool::new(
                thread_count as usize,
                batch_size,
                pause_on_success,
                use_fish_hash,
                fish_hash_full_context,
            ),
        }
    }

    #[napi]
    pub fn new_work(
        &mut self,
        header_bytes: Buffer,
        target: Buffer,
        mining_request_id: u32,
        fish_hash: bool,
        xn_length: u8,
    ) {
        self.threadpool.new_work(
            &header_bytes,
            &target,
            mining_request_id,
            fish_hash,
            xn_length,
        )
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

#[napi]
pub struct CpuCount {
    /// Estimate of the number of threads that can run simultaneously on the system. This is
    /// usually the same as `logical_count`, but on some systems (e.g. Linux), users can set limits
    /// on individual processes, and so `available_parallelism` may sometimes be lower than
    /// `logical_count`.
    pub available_parallelism: u32,
    /// Total number of 'logical CPUs', or 'virtual CPUs' or 'CPU threads' available on the system.
    /// This number differs from `physical_count` on systems that have Simultaneous Multi-Threading
    /// (SMT) enabled; on systems that do not have SMT enabled, `logical_count` and
    /// `physical_count` should be the same number.
    ///
    /// Note, on some systems and configurations, not all logical CPUs may be available to the
    /// current process, see `available_parallelism`.
    pub logical_count: u32,
    /// Total number of CPU cores available on the system.
    ///
    /// Note, on some systems and configurations, not all physical CPUs may be available to the
    /// current process, see `available_parallelism`.
    pub physical_count: u32,
}

/// Return the number of processing units available to the system and to the current process.
///
/// Note that the numbers returned by this method may change during the lifetime of the process.
/// Examples of events that may cause the numbers to change:
/// - enabling/disabling Simultaneous Multi-Threading (SMT)
/// - enabling/disabling individual CPU threads or CPU cores
/// - on Linux, changing CPU affinity masks for the process
/// - on Linux, changing cgroup quotas for the process
///
/// Also note that these numbers may not be accurate when running in a virtual machine or in a
/// sandboxed environment.
#[napi]
pub fn get_cpu_count() -> CpuCount {
    let logical_count = num_cpus::get();
    CpuCount {
        available_parallelism: std::thread::available_parallelism()
            .map(NonZeroUsize::get)
            .unwrap_or(logical_count) as u32,
        logical_count: logical_count as u32,
        physical_count: num_cpus::get_physical() as u32,
    }
}

#[napi(js_name = "generateRandomizedPublicKey")]
pub fn randomize_pk(
    view_key_string: String,
    public_key_randomness_string: String,
) -> Result<String> {
    let view_key = ViewKey::from_hex(&view_key_string).map_err(to_napi_err)?;

    let public_key_randomness =
        ironfish_jubjub::Fr::from_hex(&public_key_randomness_string).map_err(to_napi_err)?;

    let public_key =
        generate_randomized_public_key(view_key, public_key_randomness).map_err(to_napi_err)?;

    Ok(bytes_to_hex(&public_key))
}
