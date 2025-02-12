/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{errors::IronfishError, wasm_bindgen_wrapper};
use wasm_bindgen::prelude::*;

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct PublicAddress(ironfish::PublicAddress);
}

#[wasm_bindgen]
impl PublicAddress {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::PublicAddress::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        self.0.public_address().to_vec()
    }

    #[wasm_bindgen(js_name = fromHex)]
    pub fn from_hex(hex: &str) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::PublicAddress::from_hex(hex)?))
    }

    #[wasm_bindgen(js_name = toHex)]
    pub fn to_hex(&self) -> String {
        self.0.hex_public_address()
    }

    #[wasm_bindgen(js_name = isValid)]
    pub fn is_valid(hex: &str) -> bool {
        Self::from_hex(hex).is_ok()
    }
}

#[cfg(test)]
mod tests {
    use crate::keys::public_address::PublicAddress;
    use hex_literal::hex;
    use wasm_bindgen_test::wasm_bindgen_test;

    #[test]
    #[wasm_bindgen_test]
    fn deserialize_valid_address() {
        let bytes = hex!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0");
        let addr = PublicAddress::deserialize(&bytes[..])
            .expect("valid address deserialization should have succeeded");
        assert_eq!(addr.serialize(), bytes);
        assert_eq!(
            addr.to_hex(),
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0"
        );
    }

    #[test]
    #[wasm_bindgen_test]
    fn deserialize_invalid_address() {
        let bytes = hex!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1");
        PublicAddress::deserialize(&bytes[..])
            .expect_err("invalid address deserialization should have failed");
    }

    #[test]
    #[wasm_bindgen_test]
    fn from_hex_valid_address() {
        let hex = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0";
        let addr = PublicAddress::from_hex(hex)
            .expect("valid address deserialization should have succeeded");
        assert_eq!(addr.to_hex(), hex);
        assert_eq!(
            addr.to_hex(),
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0"
        );
    }

    #[test]
    #[wasm_bindgen_test]
    fn from_hex_invalid_address() {
        let hex = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1";
        PublicAddress::from_hex(hex)
            .expect_err("invalid address deserialization should have failed");
    }

    #[test]
    #[wasm_bindgen_test]
    fn is_valid() {
        assert!(PublicAddress::is_valid(
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0"
        ));
        assert!(!PublicAddress::is_valid(
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1"
        ));
    }
}
