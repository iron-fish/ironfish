/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish::{
    frost::{keys::KeyPackage, round2::Randomizer, Identifier, SigningPackage},
    frost_utils::{round_one::round_one as round_one_rust, round_two::round_two as round_two_rust},
    participant::{Identity, Secret, IDENTITY_LEN},
    serializing::{bytes_to_hex, hex_to_bytes, hex_to_vec_bytes},
};
use napi::{bindgen_prelude::*, JsBuffer};
use napi_derive::napi;
use rand::thread_rng;

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

#[napi]
pub fn round_two(
    signing_package: String,
    key_package: String,
    public_key_randomness: String,
    seed: u32,
) -> Result<String> {
    let key_package =
        KeyPackage::deserialize(&hex_to_vec_bytes(&key_package).map_err(to_napi_err)?[..])
            .map_err(to_napi_err)?;
    let signing_package =
        SigningPackage::deserialize(&hex_to_vec_bytes(&signing_package).map_err(to_napi_err)?[..])
            .map_err(to_napi_err)?;
    let randomizer =
        Randomizer::deserialize(&hex_to_bytes(&public_key_randomness).map_err(to_napi_err)?)
            .map_err(to_napi_err)?;

    let signature_share = round_two_rust(signing_package, key_package, randomizer, seed as u64)
        .map_err(to_napi_err)?;

    Ok(bytes_to_hex(&signature_share.serialize()))
}

#[napi]
pub struct ParticipantSecret {
    secret: Secret,
}

#[napi]
impl ParticipantSecret {
    // TODO(hughy): implement Secret ser/de
    #[napi(constructor)]
    pub fn random() -> ParticipantSecret {
        let secret = Secret::random(thread_rng());

        ParticipantSecret { secret }
    }

    #[napi]
    pub fn to_identity(&self) -> Result<ParticipantIdentity> {
        let identity = self.secret.to_identity();

        Ok(ParticipantIdentity { identity })
    }
}

#[napi(js_name = "Identity")]
pub struct ParticipantIdentity {
    identity: Identity,
}

#[napi]
impl ParticipantIdentity {
    #[napi(constructor)]
    pub fn new(js_bytes: JsBuffer) -> Result<ParticipantIdentity> {
        let bytes = js_bytes.into_value()?;

        let identity = Identity::deserialize_from(bytes.as_ref()).map_err(to_napi_err)?;

        Ok(ParticipantIdentity { identity })
    }

    #[napi]
    pub fn serialize(&self) -> Result<Buffer> {
        let mut vec: Vec<u8> = vec![];
        self.identity
            .serialize_into(&mut vec)
            .map_err(to_napi_err)?;

        Ok(Buffer::from(vec))
    }

    #[napi]
    pub fn to_frost_identifier(&self) -> String {
        let identifier: Identifier = self.identity.to_frost_identifier();

        bytes_to_hex(&identifier.serialize())
    }
}
