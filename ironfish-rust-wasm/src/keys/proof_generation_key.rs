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
    pub struct ProofGenerationKey(ironfish::keys::ProofGenerationKey);
}

#[wasm_bindgen]
impl ProofGenerationKey {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::keys::ProofGenerationKey::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        self.0.to_bytes().to_vec()
    }

    #[wasm_bindgen(js_name = fromParts)]
    pub fn from_parts(ak: SubgroupPoint, nsk: Fr) -> Self {
        Self(ironfish::keys::ProofGenerationKey::new(
            ak.into(),
            nsk.into(),
        ))
    }
}
