/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::IronfishError,
    primitives::{Fr, SubgroupPoint},
    wasm_bindgen_wrapper,
};
use wasm_bindgen::prelude::*;

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct EphemeralKeyPair(ironfish::keys::EphemeralKeyPair);
}

#[wasm_bindgen]
impl EphemeralKeyPair {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::keys::EphemeralKeyPair::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
            .write(&mut buf)
            .expect("failed to serialize ephemeral key pair");
        buf
    }

    #[wasm_bindgen]
    pub fn random() -> Self {
        Self(ironfish::keys::EphemeralKeyPair::new())
    }

    #[wasm_bindgen(getter)]
    pub fn secret(&self) -> Fr {
        self.0.secret().to_owned().into()
    }

    #[wasm_bindgen(getter)]
    pub fn public(&self) -> SubgroupPoint {
        self.0.public().to_owned().into()
    }
}
