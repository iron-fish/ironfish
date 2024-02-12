/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use fish_hash::Context;
use napi::{bindgen_prelude::Buffer, JsBuffer};
use napi_derive::napi;

#[napi]
pub struct FishHashContext {
    inner: Context,
}

#[napi]
impl FishHashContext {
    #[napi(constructor)]
    pub fn new(full: bool) -> Self {
        Self {
            inner: Context::new(full, None),
        }
    }

    #[napi]
    pub fn prebuild_dataset(&mut self, threads: u32) {
        self.inner.prebuild_dataset(threads as usize)
    }

    #[napi]
    pub fn hash(&mut self, header: JsBuffer) -> Buffer {
        let bytes = header.into_value().unwrap();

        let mut output = [0u8; 32];
        fish_hash::hash(&mut output, &mut self.inner, bytes.as_ref());

        Buffer::from(output.to_vec())
    }
}
