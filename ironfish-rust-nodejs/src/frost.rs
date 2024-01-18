/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish::{
    frost::keys::KeyPackage,
    frost_utils::round_one::round_one as round_one_rust,
    serializing::{bytes_to_hex, hex_to_vec_bytes},
};
use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::to_napi_err;

#[napi(object)]
pub struct RoundOneSigningData {
    pub nonce_hiding: String,
    pub nonce_binding: String,
    pub commitment_hiding: String,
    pub commitment_binding: String,
}

#[napi]
pub fn round_one(key_package: String, seed: u32) -> Result<RoundOneSigningData> {
    let key_package =
        KeyPackage::deserialize(&hex_to_vec_bytes(&key_package).map_err(to_napi_err)?)
            .map_err(to_napi_err)?;
    let (nonce, commitment) = round_one_rust(&key_package, seed as u64);
    Ok(RoundOneSigningData {
        nonce_hiding: bytes_to_hex(&nonce.hiding().serialize()),
        nonce_binding: bytes_to_hex(&nonce.binding().serialize()),
        commitment_hiding: bytes_to_hex(&commitment.hiding().serialize()),
        commitment_binding: bytes_to_hex(&commitment.binding().serialize()),
    })
}
