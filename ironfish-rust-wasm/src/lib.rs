/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

extern crate ironfish_rust;
extern crate wasm_bindgen;

use ironfish_rust::sapling_bls12;

pub mod panic_hook;
pub mod wasm_structs;

use std::str;
use wasm_bindgen::prelude::*;
use wasm_structs::WasmSaplingKeyError;

#[wasm_bindgen]
pub struct Key {
    spending_key: String,
    incoming_view_key: String,
    outgoing_view_key: String,
    public_address: String,
}

#[wasm_bindgen]
impl Key {
    #[wasm_bindgen(getter)]
    pub fn spending_key(&self) -> String {
        self.spending_key.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn incoming_view_key(&self) -> String {
        self.incoming_view_key.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn outgoing_view_key(&self) -> String {
        self.outgoing_view_key.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn public_address(&self) -> String {
        self.public_address.clone()
    }
}

#[wasm_bindgen(js_name = "generateKey")]
pub fn create_key_to_js() -> Key {
    let hasher = sapling_bls12::SAPLING.clone();
    let sapling_key = sapling_bls12::Key::generate_key(hasher);

    Key {
        spending_key: sapling_key.hex_spending_key(),
        incoming_view_key: sapling_key.incoming_view_key().hex_key(),
        outgoing_view_key: sapling_key.outgoing_view_key().hex_key(),
        public_address: sapling_key.generate_public_address().hex_public_address(),
    }
}

#[wasm_bindgen(catch, js_name = "generateNewPublicAddress")]
pub fn create_new_public_key_to_js(private_key: &str) -> Result<Key, JsValue> {
    let hasher = sapling_bls12::SAPLING.clone();
    let sapling_key =
        sapling_bls12::Key::from_hex(hasher, private_key).map_err(WasmSaplingKeyError)?;

    Ok(Key {
        spending_key: sapling_key.hex_spending_key(),
        incoming_view_key: sapling_key.incoming_view_key().hex_key(),
        outgoing_view_key: sapling_key.outgoing_view_key().hex_key(),
        public_address: sapling_key.generate_public_address().hex_public_address(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_new_public_key_to_js() {
        let key1 = create_key_to_js();
        let key2 = create_new_public_key_to_js(&key1.spending_key).unwrap();

        assert_eq!(key1.spending_key(), key2.spending_key());
        assert_eq!(key1.incoming_view_key(), key2.incoming_view_key());
        assert_eq!(key1.outgoing_view_key(), key2.outgoing_view_key());

        assert_ne!(key1.public_address(), key2.public_address());
    }
}
