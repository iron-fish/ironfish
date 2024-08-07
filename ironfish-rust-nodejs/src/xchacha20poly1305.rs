/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish::{
    serializing::{bytes_to_hex, hex_to_vec_bytes},
    xchacha20poly1305,
};
use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::to_napi_err;

#[napi]
pub fn encrypt(plaintext: String, passphrase: String) -> Result<String> {
    let plaintext_bytes = hex_to_vec_bytes(&plaintext).map_err(to_napi_err)?;
    let passphrase_bytes = hex_to_vec_bytes(&passphrase).map_err(to_napi_err)?;
    let result =
        xchacha20poly1305::encrypt(&plaintext_bytes, &passphrase_bytes).map_err(to_napi_err)?;

    let mut vec: Vec<u8> = vec![];
    result.write(&mut vec).map_err(to_napi_err)?;

    Ok(bytes_to_hex(&vec))
}
