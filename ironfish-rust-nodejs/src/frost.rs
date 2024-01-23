/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish::{
    frost::{
        keys::KeyPackage,
        round2::{Randomizer, SignatureShare},
        SigningPackage,
    },
    frost_utils::{round_one::round_one as round_one_rust, round_two::round_two as round_two_rust},
    serializing::{bytes_to_hex, hex_to_bytes, hex_to_vec_bytes},
};
use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::to_napi_err;

#[napi(object, js_name = "SigningCommitments")]
pub struct NativeSigningCommitments {
    pub hiding: String,
    pub binding: String,
}

#[napi]
pub fn round_one(key_package: String, seed: u32) -> Result<NativeSigningCommitments> {
    let key_package =
        KeyPackage::deserialize(&hex_to_vec_bytes(&key_package).map_err(to_napi_err)?)
            .map_err(to_napi_err)?;
    let (_, commitment) = round_one_rust(&key_package, seed as u64);
    Ok(NativeSigningCommitments {
        hiding: bytes_to_hex(&commitment.hiding().serialize()),
        binding: bytes_to_hex(&commitment.binding().serialize()),
    })
}

pub fn round_two(
    signing_package: String,
    key_package: String,
    public_key_randomness: String,
    seed: u64,
) -> Result<SignatureShare> {
    let key_package =
        KeyPackage::deserialize(&hex_to_vec_bytes(&key_package).map_err(to_napi_err)?[..])
            .map_err(to_napi_err)?;
    let signing_package =
        SigningPackage::deserialize(&hex_to_vec_bytes(&signing_package).map_err(to_napi_err)?[..])
            .map_err(to_napi_err)?;
    let randomizer =
        Randomizer::deserialize(&hex_to_bytes(&public_key_randomness).map_err(to_napi_err)?)
            .map_err(to_napi_err)?;
    round_two_rust(signing_package, key_package, randomizer, seed).map_err(to_napi_err)
}
