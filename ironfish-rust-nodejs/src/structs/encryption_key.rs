/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::to_napi_err;
use ironfish::xchacha20poly1305::{EncryptionKey, XNONCE_LENGTH as XNONCE_SIZE};
use napi::bindgen_prelude::*;
use napi::JsBuffer;
use napi_derive::napi;

#[napi]
pub const XNONCE_LENGTH: u32 = XNONCE_SIZE as u32;

#[napi(js_name = "EncryptionKey")]
pub struct NativeEncryptionKey {
    pub(crate) encryption_key: EncryptionKey,
}

#[napi]
impl NativeEncryptionKey {
    #[napi(constructor)]
    pub fn generate(
        passphrase: String,
    ) -> Result<NativeEncryptionKey> {
        let encryption_key = EncryptionKey::generate(passphrase.as_bytes()).map_err(to_napi_err)?;

        Ok(NativeEncryptionKey {
            encryption_key,
        })
    }

    #[napi(factory)]
    pub fn deserialize(js_bytes: JsBuffer) -> Result<Self> {
        let byte_vec = js_bytes.into_value()?;

        let encryption_key = EncryptionKey::read(byte_vec.as_ref()).map_err(to_napi_err)?;

        Ok(NativeEncryptionKey { encryption_key })
    }
}
