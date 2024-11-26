/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::IronfishError, keys::PublicAddress, primitives::PublicKey, wasm_bindgen_wrapper,
};
use wasm_bindgen::prelude::*;

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct IncomingViewKey(ironfish::keys::IncomingViewKey);
}

#[wasm_bindgen]
impl IncomingViewKey {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::keys::IncomingViewKey::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        self.0.to_bytes().to_vec()
    }

    #[wasm_bindgen(js_name = fromHex)]
    pub fn from_hex(hex: &str) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::keys::IncomingViewKey::from_hex(hex)?))
    }

    #[wasm_bindgen(js_name = toHex)]
    pub fn to_hex(&self) -> String {
        self.0.hex_key()
    }

    // TODO: to/fromWords

    #[wasm_bindgen(getter, js_name = publicAddress)]
    pub fn public_address(&self) -> PublicAddress {
        self.0.public_address().into()
    }
}

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct OutgoingViewKey(ironfish::keys::OutgoingViewKey);
}

#[wasm_bindgen]
impl OutgoingViewKey {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::keys::OutgoingViewKey::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        self.0.to_bytes().to_vec()
    }

    #[wasm_bindgen(js_name = fromHex)]
    pub fn from_hex(hex: &str) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::keys::OutgoingViewKey::from_hex(hex)?))
    }

    #[wasm_bindgen(js_name = toHex)]
    pub fn to_hex(&self) -> String {
        self.0.hex_key()
    }

    // TODO: to/fromWords
}

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct ViewKey(ironfish::keys::ViewKey);
}

#[wasm_bindgen]
impl ViewKey {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::keys::ViewKey::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        self.0.to_bytes().to_vec()
    }

    #[wasm_bindgen(js_name = fromHex)]
    pub fn from_hex(hex: &str) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::keys::ViewKey::from_hex(hex)?))
    }

    #[wasm_bindgen(js_name = toHex)]
    pub fn to_hex(&self) -> String {
        self.0.hex_key()
    }

    #[wasm_bindgen(getter, js_name = publicAddress)]
    pub fn public_address(&self) -> Result<PublicAddress, IronfishError> {
        self.0
            .public_address()
            .map(|a| a.into())
            .map_err(|e| e.into())
    }

    #[wasm_bindgen(getter, js_name = authorizingKey)]
    pub fn authorizing_key(&self) -> PublicKey {
        self.0.authorizing_key.into()
    }

    #[wasm_bindgen(getter, js_name = nullifierDerivingKey)]
    pub fn nullifier_deriving_key(&self) -> PublicKey {
        self.0.nullifier_deriving_key.into()
    }
}
