/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish::rolling_filter::RollingFilter;
use napi::JsBuffer;
use napi_derive::napi;

#[napi(js_name = "RollingFilter")]
pub struct NativeRollingFilter {
    inner: RollingFilter,
}

#[napi]
impl NativeRollingFilter {
    #[napi(constructor)]
    #[allow(clippy::new_without_default)]
    pub fn new(items: u32, rate: f64) -> Self {
        Self {
            inner: RollingFilter::new(items, rate),
        }
    }

    #[napi]
    pub fn add(&mut self, value: JsBuffer) {
        let v = value.into_value().unwrap();
        self.inner.add(v.as_ref())
    }

    #[napi]
    pub fn test(&self, value: JsBuffer) -> bool {
        let v = value.into_value().unwrap();
        self.inner.test(v.as_ref())
    }
}
