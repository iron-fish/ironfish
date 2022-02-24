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

#[napi(object)]
pub struct MineHeaderNapiResult {
    pub randomness: f64,
    pub found_match: bool,
}

#[napi]
pub fn mine_header_batch(
    mut header_bytes: Buffer,
    initial_randomness: i64,
    target_buffer: Buffer,
    batch_size: i64,
) -> MineHeaderNapiResult {
    let mut target_array = [0u8; 32];
    target_array.copy_from_slice(&target_buffer[..32]);

    // Execute batch mine operation
    let mine_header_result = mining::mine_header_batch(
        header_bytes.as_mut(),
        initial_randomness,
        &target_array,
        batch_size,
    );

    MineHeaderNapiResult {
        randomness: mine_header_result.randomness,
        found_match: mine_header_result.found_match,
    }
}
