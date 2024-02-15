/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    structs::{IdentityKeyPackage, TrustedDealerKeyPackages},
    to_napi_err,
};
use ironfish::{
    frost::{keys::KeyPackage, round2::Randomizer, SigningPackage},
    frost_utils::{
        signature_share::create_signature_share as create_signature_share_rust,
        signing_commitment::{
            create_signing_commitment as create_signing_commitment_rust, SigningCommitment,
        },
        split_spender_key::split_spender_key,
    },
    participant::{Identity, Secret},
    serializing::{bytes_to_hex, fr::FrSerializable, hex_to_bytes, hex_to_vec_bytes},
    SaplingKey,
};
use napi::{bindgen_prelude::*, JsBuffer};
use napi_derive::napi;
use rand::thread_rng;

use ironfish::frost_utils::IDENTITY_LEN as ID_LEN;

#[napi]
pub const IDENTITY_LEN: u32 = ID_LEN as u32;

#[napi]
pub fn create_signing_commitment(key_package: String, seed: u32) -> Result<String> {
    let key_package =
        KeyPackage::deserialize(&hex_to_vec_bytes(&key_package).map_err(to_napi_err)?)
            .map_err(to_napi_err)?;
    let (_, commitment) = create_signing_commitment_rust(&key_package, seed as u64);

    let signing_commitment = SigningCommitment {
        identifier: *key_package.identifier(),
        hiding: *commitment.hiding(),
        binding: *commitment.binding(),
    };

    Ok(bytes_to_hex(&signing_commitment.serialize()))
}

#[napi]
pub fn create_signature_share(
    signing_package: String,
    identity: String,
    key_package: String,
    public_key_randomness: String,
    seed: u32,
) -> Result<String> {
    let identity =
        Identity::deserialize_from(&hex_to_vec_bytes(&identity).map_err(to_napi_err)?[..])
            .map_err(to_napi_err)?;
    let key_package =
        KeyPackage::deserialize(&hex_to_vec_bytes(&key_package).map_err(to_napi_err)?[..])
            .map_err(to_napi_err)?;
    let signing_package =
        SigningPackage::deserialize(&hex_to_vec_bytes(&signing_package).map_err(to_napi_err)?[..])
            .map_err(to_napi_err)?;
    let randomizer =
        Randomizer::deserialize(&hex_to_bytes(&public_key_randomness).map_err(to_napi_err)?)
            .map_err(to_napi_err)?;

    let signature_share = create_signature_share_rust(
        signing_package,
        &identity,
        key_package,
        randomizer,
        seed as u64,
    )
    .map_err(to_napi_err)?;

    Ok(bytes_to_hex(&signature_share.serialize()))
}

#[napi]
pub struct ParticipantSecret {
    secret: Secret,
}

#[napi]
impl ParticipantSecret {
    #[napi(constructor)]
    pub fn new(js_bytes: JsBuffer) -> Result<ParticipantSecret> {
        let bytes = js_bytes.into_value()?;

        let secret = Secret::deserialize_from(bytes.as_ref()).map_err(to_napi_err)?;

        Ok(ParticipantSecret { secret })
    }

    #[napi]
    pub fn serialize(&self) -> Result<Buffer> {
        let mut vec: Vec<u8> = vec![];
        self.secret.serialize_into(&mut vec).map_err(to_napi_err)?;

        Ok(Buffer::from(vec))
    }

    #[napi]
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

#[napi]
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
}

#[napi]
pub fn split_secret(
    coordinator_sapling_key: String,
    min_signers: u16,
    identities: Vec<String>,
) -> Result<TrustedDealerKeyPackages> {
    let coordinator_key =
        SaplingKey::new(hex_to_bytes(&coordinator_sapling_key).map_err(to_napi_err)?)
            .map_err(to_napi_err)?;

    let mut deserialized_identities = Vec::new();

    for identity in &identities {
        let bytes = hex_to_vec_bytes(identity).map_err(to_napi_err)?;
        let frost_id = Identity::deserialize_from(&bytes[..]).map_err(to_napi_err)?;
        deserialized_identities.push(frost_id);
    }

    let t = split_spender_key(&coordinator_key, min_signers, deserialized_identities)
        .map_err(to_napi_err)?;

    let mut key_packages_serialized = Vec::new();
    for (k, v) in t.key_packages.iter() {
        key_packages_serialized.push(IdentityKeyPackage {
            identity: bytes_to_hex(&k.serialize()),
            key_package: bytes_to_hex(&v.serialize().map_err(to_napi_err)?),
        });
    }

    let public_key_package = t.public_key_package.serialize().map_err(to_napi_err)?;

    Ok(TrustedDealerKeyPackages {
        verifying_key: bytes_to_hex(&t.verifying_key),
        proof_authorizing_key: t.proof_authorizing_key.hex_key(),
        view_key: t.view_key.hex_key(),
        incoming_view_key: t.incoming_view_key.hex_key(),
        outgoing_view_key: t.outgoing_view_key.hex_key(),
        public_address: t.public_address.hex_public_address(),
        key_packages: key_packages_serialized,
        public_key_package: bytes_to_hex(&public_key_package),
    })
}
