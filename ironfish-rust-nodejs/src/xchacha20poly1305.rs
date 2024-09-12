/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish::xchacha20poly1305::{self};
use napi::{bindgen_prelude::*, JsBuffer};
use napi_derive::napi;

use crate::{structs::NativeEncryptionKey, to_napi_err};

#[napi]
pub fn encrypt(plaintext: JsBuffer, key: JsBuffer) -> Result<Buffer> {
    let encryption_key = NativeEncryptionKey::deserialize(key).map_err(to_napi_err)?;

    let plaintext_bytes = plaintext.into_value()?;
    let result = xchacha20poly1305::encrypt(plaintext_bytes.as_ref(), &encryption_key.encryption_key)
        .map_err(to_napi_err)?;

    Ok(Buffer::from(&result[..]))
}

#[napi]
pub fn decrypt(ciphertext: JsBuffer, key: JsBuffer) -> Result<Buffer> {
    let byte_vec = ciphertext.into_value()?;

    let encryption_key = NativeEncryptionKey::deserialize(key).map_err(to_napi_err)?;
    let result =
        xchacha20poly1305::decrypt(byte_vec.to_vec(), &encryption_key.encryption_key).map_err(to_napi_err)?;

    Ok(Buffer::from(&result[..]))
}
