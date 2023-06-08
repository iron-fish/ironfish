/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish::{IncomingViewKey, OutgoingViewKey, ViewKey};
use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::to_napi_err;

#[napi]
pub struct NativeIncomingViewKey {
    pub(crate) inner: IncomingViewKey,
}

#[napi]
impl NativeIncomingViewKey {
    #[napi(constructor)]
    pub fn from_hex(incoming_hex_key: String) -> Result<Self> {
        let incoming_view_key =
            IncomingViewKey::from_hex(&incoming_hex_key).map_err(to_napi_err)?;

        Ok(Self {
            inner: incoming_view_key,
        })
    }
}

#[napi]
pub struct NativeOutgoingViewKey {
    pub(crate) inner: OutgoingViewKey,
}

#[napi]
impl NativeOutgoingViewKey {
    #[napi(constructor)]
    pub fn from_hex(outgoing_hex_key: String) -> Result<Self> {
        let outgoing_view_key =
            OutgoingViewKey::from_hex(&outgoing_hex_key).map_err(to_napi_err)?;

        Ok(Self {
            inner: outgoing_view_key,
        })
    }
}

#[napi]
pub struct NativeViewKey {
    pub(crate) inner: ViewKey,
}

#[napi]
impl NativeViewKey {
    #[napi(constructor)]
    pub fn from_hex(view_hex_key: String) -> Result<Self> {
        let view_key = ViewKey::from_hex(&view_hex_key).map_err(to_napi_err)?;

        Ok(Self { inner: view_key })
    }
}
