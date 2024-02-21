/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    structs::{IdentityKeyPackage, TrustedDealerKeyPackages},
    to_napi_err,
};
use ironfish::{
    frost::{keys::KeyPackage, round1::SigningCommitments, round2, Randomizer},
    frost_utils::{
        signature_share::SignatureShare, signing_commitment::SigningCommitment,
        signing_package::SigningPackage, split_spender_key::split_spender_key,
    },
    participant::{Identity, Secret},
    serializing::{bytes_to_hex, fr::FrSerializable, hex_to_bytes, hex_to_vec_bytes},
    SaplingKey,
};
use ironfish_frost::nonces::deterministic_signing_nonces;
use napi::{bindgen_prelude::*, JsBuffer};
use napi_derive::napi;
use rand::thread_rng;
use std::ops::Deref;

fn try_deserialize_signers<I, S>(signers: I) -> Result<Vec<Identity>>
where
    I: IntoIterator<Item = S>,
    S: Deref<Target = str>,
{
    signers
        .into_iter()
        .try_fold(Vec::new(), |mut signers, serialized_identity| {
            let serialized_identity =
                hex_to_vec_bytes(&serialized_identity).map_err(to_napi_err)?;
            Identity::deserialize_from(&serialized_identity[..])
                .map(|identity| {
                    signers.push(identity);
                    signers
                })
                .map_err(to_napi_err)
        })
}

use ironfish::frost_utils::IDENTITY_LEN as ID_LEN;

#[napi]
pub const IDENTITY_LEN: u32 = ID_LEN as u32;

#[napi]
pub fn create_signing_commitment(
    identity: String,
    key_package: String,
    transaction_hash: JsBuffer,
    signers: Vec<String>,
) -> Result<String> {
    let identity =
        Identity::deserialize_from(&hex_to_vec_bytes(&identity).map_err(to_napi_err)?[..])?;
    let key_package =
        KeyPackage::deserialize(&hex_to_vec_bytes(&key_package).map_err(to_napi_err)?)
            .map_err(to_napi_err)?;
    let transaction_hash = transaction_hash.into_value()?;
    let signers = try_deserialize_signers(signers)?;

    let nonces =
        deterministic_signing_nonces(key_package.signing_share(), &transaction_hash, &signers);
    let commitments = SigningCommitments::from(&nonces);

    let signing_commitment = SigningCommitment {
        identity,
        hiding: *commitments.hiding(),
        binding: *commitments.binding(),
    };

    Ok(bytes_to_hex(&signing_commitment.serialize()))
}

#[napi]
pub fn create_signature_share(
    identity: String,
    key_package: String,
    signing_package: String,
) -> Result<String> {
    let identity =
        Identity::deserialize_from(&hex_to_vec_bytes(&identity).map_err(to_napi_err)?[..])
            .map_err(to_napi_err)?;
    let key_package =
        KeyPackage::deserialize(&hex_to_vec_bytes(&key_package).map_err(to_napi_err)?[..])
            .map_err(to_napi_err)?;

    let signing_package =
        SigningPackage::read(&hex_to_vec_bytes(&signing_package).map_err(to_napi_err)?[..])
            .map_err(to_napi_err)?;

    let transaction_hash = signing_package
        .unsigned_transaction
        .transaction_signature_hash()
        .map_err(to_napi_err)?;

    let randomizer = Randomizer::deserialize(
        &signing_package
            .unsigned_transaction
            .public_key_randomness()
            .to_bytes(),
    )
    .map_err(to_napi_err)?;

    let nonces = deterministic_signing_nonces(
        key_package.signing_share(),
        &transaction_hash,
        &signing_package.signers,
    );

    let signature_share = round2::sign(
        &signing_package.frost_signing_package,
        &nonces,
        &key_package,
        randomizer,
    )
    .map_err(to_napi_err)?;

    let signature_share = SignatureShare {
        identity,
        signature_share,
    };

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

    let mut public_key_package_vec: Vec<u8> = vec![];
    t.public_key_package
        .write(&mut public_key_package_vec)
        .map_err(to_napi_err)?;

    Ok(TrustedDealerKeyPackages {
        verifying_key: bytes_to_hex(&t.verifying_key),
        proof_authorizing_key: t.proof_authorizing_key.hex_key(),
        view_key: t.view_key.hex_key(),
        incoming_view_key: t.incoming_view_key.hex_key(),
        outgoing_view_key: t.outgoing_view_key.hex_key(),
        public_address: t.public_address.hex_public_address(),
        key_packages: key_packages_serialized,
        public_key_package: bytes_to_hex(&public_key_package_vec),
    })
}
