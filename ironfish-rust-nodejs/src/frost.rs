/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    structs::{IdentityKeyPackage, TrustedDealerKeyPackages},
    to_napi_err,
};
use ironfish::{
    frost::{keys::KeyPackage, round1::SigningCommitments, round2, Randomizer},
    frost_utils::{signing_package::SigningPackage, split_spender_key::split_spender_key},
    participant::{Identity, Secret},
    serializing::{bytes_to_hex, fr::FrSerializable, hex_to_bytes, hex_to_vec_bytes},
    SaplingKey,
};
use ironfish_frost::{
    keys::PublicKeyPackage, multienc, nonces::deterministic_signing_nonces,
    signature_share::SignatureShare, signing_commitment::{self, SigningCommitment},
};
use napi::{bindgen_prelude::*, JsBuffer};
use napi_derive::napi;
use rand::thread_rng;
use std::ops::Deref;

#[napi]
pub const IDENTITY_LEN: u32 = ironfish::frost_utils::IDENTITY_LEN as u32;

fn try_deserialize_identities<I, S>(signers: I) -> Result<Vec<Identity>>
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

#[napi]
pub fn create_signing_commitment(
    secret: String,
    key_package: String,
    transaction_hash: JsBuffer,
    signers: Vec<String>,
) -> Result<String> {
    let secret =
        Secret::deserialize_from(&hex_to_vec_bytes(&secret).map_err(to_napi_err)?[..])?;
    let key_package =
        KeyPackage::deserialize(&hex_to_vec_bytes(&key_package).map_err(to_napi_err)?)
            .map_err(to_napi_err)?;
    let transaction_hash = transaction_hash.into_value()?;
    let signers = try_deserialize_identities(signers)?;

    let nonces =
        deterministic_signing_nonces(key_package.signing_share(), &transaction_hash, &signers);
    let commitments = SigningCommitments::from(&nonces);

    let signing_commitment =
        SigningCommitment::from_frost(secret, *commitments.hiding(), *commitments.binding());

    let bytes = signing_commitment.serialize()?;

    Ok(bytes_to_hex(&bytes[..]))
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

    let signature_share = SignatureShare::from_frost(signature_share, identity);
    let bytes = signature_share.serialize()?;

    Ok(bytes_to_hex(&bytes[..]))
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
        Secret::deserialize_from(bytes.as_ref())
            .map(|secret| ParticipantSecret { secret })
            .map_err(to_napi_err)
    }

    #[napi]
    pub fn serialize(&self) -> Buffer {
        Buffer::from(self.secret.serialize().as_slice())
    }

    #[napi]
    pub fn random() -> ParticipantSecret {
        let secret = Secret::random(thread_rng());
        ParticipantSecret { secret }
    }

    #[napi]
    pub fn to_identity(&self) -> ParticipantIdentity {
        let identity = self.secret.to_identity();
        ParticipantIdentity { identity }
    }

    #[napi]
    pub fn decrypt_data(&self, js_bytes: JsBuffer) -> Result<Buffer> {
        let bytes = js_bytes.into_value()?;
        let encrypted_blob =
            multienc::MultiRecipientBlob::deserialize_from(bytes.as_ref()).map_err(to_napi_err)?;
        multienc::decrypt(&self.secret, &encrypted_blob)
            .map(Buffer::from)
            .map_err(to_napi_err)
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
        Identity::deserialize_from(bytes.as_ref())
            .map(|identity| ParticipantIdentity { identity })
            .map_err(to_napi_err)
    }

    #[napi]
    pub fn serialize(&self) -> Buffer {
        Buffer::from(self.identity.serialize().as_slice())
    }

    #[napi]
    pub fn encrypt_data(&self, js_bytes: JsBuffer) -> Result<Buffer> {
        let bytes = js_bytes.into_value()?;
        let encrypted_blob = multienc::encrypt(&bytes, [&self.identity], thread_rng());
        encrypted_blob
            .serialize()
            .map(Buffer::from)
            .map_err(to_napi_err)
    }
}

#[napi]
pub fn split_secret(
    spending_key: String,
    min_signers: u16,
    identities: Vec<String>,
) -> Result<TrustedDealerKeyPackages> {
    let spending_key = hex_to_bytes(&spending_key)
        .and_then(SaplingKey::new)
        .map_err(to_napi_err)?;

    let identities = try_deserialize_identities(identities)?;

    let packages =
        split_spender_key(&spending_key, min_signers, identities).map_err(to_napi_err)?;

    let mut key_packages = Vec::with_capacity(packages.key_packages.len());
    for (identity, key_package) in packages.key_packages.iter() {
        key_packages.push(IdentityKeyPackage {
            identity: bytes_to_hex(&identity.serialize()),
            key_package: bytes_to_hex(&key_package.serialize().map_err(to_napi_err)?),
        });
    }

    let public_key_package = packages
        .public_key_package
        .serialize()
        .map_err(to_napi_err)?;

    Ok(TrustedDealerKeyPackages {
        proof_authorizing_key: packages.proof_authorizing_key.hex_key(),
        view_key: packages.view_key.hex_key(),
        incoming_view_key: packages.incoming_view_key.hex_key(),
        outgoing_view_key: packages.outgoing_view_key.hex_key(),
        public_address: packages.public_address.hex_public_address(),
        key_packages,
        public_key_package: bytes_to_hex(&public_key_package),
    })
}

#[napi(js_name = "PublicKeyPackage")]
pub struct NativePublicKeyPackage {
    public_key_package: PublicKeyPackage,
}

#[napi]
impl NativePublicKeyPackage {
    #[napi(constructor)]
    pub fn new(value: String) -> Result<NativePublicKeyPackage> {
        let bytes = hex_to_vec_bytes(&value).map_err(to_napi_err)?;

        let public_key_package =
            PublicKeyPackage::deserialize_from(&bytes[..]).map_err(to_napi_err)?;

        Ok(NativePublicKeyPackage { public_key_package })
    }

    #[napi]
    pub fn identities(&self) -> Vec<Buffer> {
        self.public_key_package
            .identities()
            .iter()
            .map(|identity| Buffer::from(&identity.serialize()[..]))
            .collect()
    }
}

#[napi(js_name="SigningCommitment")]
pub struct NativeSigningCommitment {
    signing_commitment: SigningCommitment,
}

#[napi]
impl NativeSigningCommitment {
    #[napi(constructor)]
    pub fn new(value: String) -> Result<NativeSigningCommitment> {
        let bytes = hex_to_vec_bytes(&value).map_err(to_napi_err)?;

        let signing_commitment =
            SigningCommitment::deserialize_from(&bytes[..]).map_err(to_napi_err)?;

        Ok(NativeSigningCommitment { signing_commitment })
    }

    pub fn identity(&self) -> Buffer {
        Buffer::from(&self.signing_commitment.identity().serialize()[..])
    }

    pub fn 
}
