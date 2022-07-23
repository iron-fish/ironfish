/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish_rust::errors::*;

pub struct WasmIoError(pub std::io::Error);
pub struct WasmSaplingKeyError(pub SaplingKeyError);
pub struct WasmSaplingProofError(pub SaplingProofError);
pub struct WasmTransactionError(pub TransactionError);

impl From<WasmIoError> for wasm_bindgen::JsValue {
    fn from(e: WasmIoError) -> Self {
        js_sys::Error::new(&e.0.to_string()).into()
    }
}

impl From<WasmSaplingKeyError> for wasm_bindgen::JsValue {
    fn from(e: WasmSaplingKeyError) -> Self {
        js_sys::Error::new(&e.0.to_string()).into()
    }
}

impl From<WasmSaplingProofError> for wasm_bindgen::JsValue {
    fn from(e: WasmSaplingProofError) -> Self {
        js_sys::Error::new(&e.0.to_string()).into()
    }
}

impl From<WasmTransactionError> for wasm_bindgen::JsValue {
    fn from(e: WasmTransactionError) -> Self {
        js_sys::Error::new(&e.0.to_string()).into()
    }
}
