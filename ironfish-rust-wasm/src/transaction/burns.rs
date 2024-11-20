/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{assets::AssetIdentifier, errors::IronfishError, wasm_bindgen_wrapper};
use wasm_bindgen::prelude::*;

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct BurnDescription(ironfish::transaction::burns::BurnDescription);
}

#[wasm_bindgen]
impl BurnDescription {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<BurnDescription, IronfishError> {
        Ok(Self(ironfish::transaction::burns::BurnDescription::read(
            bytes,
        )?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
            .write(&mut buf)
            .expect("failed to serialize mint description");
        buf
    }

    #[wasm_bindgen(getter, js_name = assetId)]
    pub fn asset_id(&self) -> AssetIdentifier {
        self.0.asset_id.into()
    }

    #[wasm_bindgen(getter)]
    pub fn value(&self) -> u64 {
        self.0.value
    }
}
