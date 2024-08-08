/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish::xchacha20poly1305::{self, EncryptOutput};
use napi::{bindgen_prelude::*, JsBuffer};
use napi_derive::napi;

use crate::to_napi_err;

#[napi]
pub fn encrypt(plaintext: JsBuffer, passphrase: String) -> Result<Buffer> {
    let plaintext_bytes = plaintext.into_value()?;
    let result = xchacha20poly1305::encrypt(plaintext_bytes.as_ref(), passphrase.as_bytes())
        .map_err(to_napi_err)?;

    let mut vec: Vec<u8> = vec![];
    result.write(&mut vec).map_err(to_napi_err)?;

    Ok(Buffer::from(&vec[..]))
}

#[napi]
pub fn decrypt(encrypted_blob: JsBuffer, passphrase: String) -> Result<Buffer> {
    let encrypted_bytes = encrypted_blob.into_value()?;

    let encrypted_output = EncryptOutput::read(encrypted_bytes.as_ref()).map_err(to_napi_err)?;
    let result =
        xchacha20poly1305::decrypt(encrypted_output, passphrase.as_bytes()).map_err(to_napi_err)?;

    Ok(Buffer::from(&result[..]))
}
