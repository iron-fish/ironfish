/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::errors::IronfishError;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct PublicAddress(ironfish::PublicAddress);

#[wasm_bindgen]
impl PublicAddress {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<PublicAddress, IronfishError> {
        Ok(Self(ironfish::PublicAddress::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        self.0.public_address().to_vec()
    }

    #[wasm_bindgen(getter)]
    pub fn bytes(&self) -> Vec<u8> {
        self.0.public_address().to_vec()
    }

    #[wasm_bindgen(getter)]
    pub fn hex(&self) -> String {
        self.0.hex_public_address()
    }
}

impl From<ironfish::PublicAddress> for PublicAddress {
    fn from(d: ironfish::PublicAddress) -> Self {
        Self(d)
    }
}

impl AsRef<ironfish::PublicAddress> for PublicAddress {
    fn as_ref(&self) -> &ironfish::PublicAddress {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use crate::keys::public_address::PublicAddress;
    use hex_literal::hex;

    #[test]
    fn valid_address() {
        let bytes = hex!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0");
        let addr = PublicAddress::deserialize(&bytes[..])
            .expect("valid address deserialization should have succeeded");
        assert_eq!(addr.serialize(), bytes);
        assert_eq!(addr.bytes(), bytes);
        assert_eq!(
            addr.hex(),
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0"
        );
    }

    #[test]
    fn invalid_address() {
        let bytes = hex!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1");
        PublicAddress::deserialize(&bytes[..])
            .expect_err("invalid address deserialization should have failed");
    }
}
