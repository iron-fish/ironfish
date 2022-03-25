/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

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
    let hasher = sapling_bls12::SAPLING.clone();
    let sapling_key = sapling_bls12::Key::generate_key(hasher);

    Key {
        spending_key: sapling_key.hex_spending_key(),
        incoming_view_key: sapling_key.incoming_view_key().hex_key(),
        outgoing_view_key: sapling_key.outgoing_view_key().hex_key(),
        public_address: sapling_key.generate_public_address().hex_public_address(),
    }
}

#[napi]
pub fn generate_new_public_address(private_key: String) -> Result<Key> {
    let hasher = sapling_bls12::SAPLING.clone();
    let sapling_key = sapling_bls12::Key::from_hex(hasher, &private_key)
        .map_err(|err| Error::from_reason(err.to_string()))?;

    Ok(Key {
        spending_key: sapling_key.hex_spending_key(),
        incoming_view_key: sapling_key.incoming_view_key().hex_key(),
        outgoing_view_key: sapling_key.outgoing_view_key().hex_key(),
        public_address: sapling_key.generate_public_address().hex_public_address(),
    })
}

#[napi(constructor)]
pub struct FoundBlockResult {
    pub randomness: f64,
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
                randomness: result.0 as f64,
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
