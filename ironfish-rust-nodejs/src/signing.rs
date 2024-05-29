/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::to_napi_err;
use ironfish::{
    keys::{PublicAddress, SaplingKey},
    serializing::{bytes_to_hex, hex_to_vec_bytes},
    signing::MessageSignature,
};
use napi::{bindgen_prelude::*, JsBuffer};
use napi_derive::napi;
use rand::thread_rng;

#[napi(namespace = "signing")]
pub fn sign_message(secret_key: String, message: JsBuffer) -> Result<String> {
    let secret_key = hex_to_vec_bytes(&secret_key).map_err(to_napi_err)?;
    let secret_key = SaplingKey::read(&secret_key[..]).map_err(to_napi_err)?;

    let message = message.into_value()?;

    let signature =
        ironfish::signing::sign_message(&secret_key, message.as_ref(), thread_rng()).to_bytes();
    Ok(bytes_to_hex(&signature[..]))
}

#[napi(namespace = "signing")]
pub fn verify_message(public_address: String, message: JsBuffer, signature: String) -> Result<()> {
    let public_address = hex_to_vec_bytes(&public_address).map_err(to_napi_err)?;
    let public_address = PublicAddress::read(&public_address[..]).map_err(to_napi_err)?;

    let message = message.into_value()?;

    let signature = hex_to_vec_bytes(&signature).map_err(to_napi_err)?;
    let signature = MessageSignature::read(&signature[..]).map_err(to_napi_err)?;

    ironfish::signing::verify_message(&public_address, message.as_ref(), &signature)
        .map_err(to_napi_err)
}
