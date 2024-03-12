/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{structs::NativeUnsignedTransaction, to_napi_err};
use ironfish::{
    frost::{keys::KeyPackage, round2, Randomizer},
    frost_utils::{signing_package::SigningPackage, split_spender_key::split_spender_key},
    participant::{Identity, Secret},
    serializing::{bytes_to_hex, fr::FrSerializable, hex_to_vec_bytes},
    SaplingKey,
};
use ironfish_frost::{
    keys::PublicKeyPackage, multienc, nonces::deterministic_signing_nonces,
    signature_share::SignatureShare, signing_commitment::SigningCommitment,
};
use napi::{bindgen_prelude::*, JsBuffer};
use napi_derive::napi;
use rand::thread_rng;
use std::ops::Deref;

#[napi]
pub const IDENTITY_LEN: u32 = ironfish::frost_utils::IDENTITY_LEN as u32;

#[napi]
pub const SECRET_LEN: u32 = ironfish_frost::participant::SECRET_LEN as u32;

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
    let secret = Secret::deserialize_from(&hex_to_vec_bytes(&secret).map_err(to_napi_err)?[..])?;
    let key_package =
        KeyPackage::deserialize(&hex_to_vec_bytes(&key_package).map_err(to_napi_err)?)
            .map_err(to_napi_err)?;
    let transaction_hash = transaction_hash.into_value()?;
    let signers = try_deserialize_identities(signers)?;

    let signing_commitment = SigningCommitment::from_secrets(
        &secret,
        key_package.signing_share(),
        &transaction_hash,
        &signers,
    );

    let bytes = signing_commitment.serialize();
    Ok(bytes_to_hex(&bytes[..]))
}

#[napi]
pub fn create_signature_share(
    secret: String,
    key_package: String,
    signing_package: String,
) -> Result<String> {
    let secret = Secret::deserialize_from(&hex_to_vec_bytes(&secret).map_err(to_napi_err)?[..])?;
    let identity = secret.to_identity();
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
    let bytes = signature_share.serialize();

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
pub fn generate_and_split_key(
    min_signers: u16,
    identities: Vec<String>,
) -> Result<TrustedDealerKeyPackages> {
    let spending_key = SaplingKey::generate_key();

    let identities = try_deserialize_identities(identities)?;

    let packages =
        split_spender_key(&spending_key, min_signers, &identities).map_err(to_napi_err)?;

    let mut key_packages = Vec::with_capacity(packages.key_packages.len());

    // preserves the order of the identities
    for identity in identities {
        let key_package = packages
            .key_packages
            .get(&identity)
            .ok_or_else(|| to_napi_err("Key package not found for identity"))?
            .serialize()
            .map_err(to_napi_err)?;

        key_packages.push(ParticipantKeyPackage {
            identity: bytes_to_hex(&identity.serialize()),
            key_package: bytes_to_hex(&key_package),
        });
    }

    let public_key_package = packages
        .public_key_package
        .serialize()
        .map_err(to_napi_err)?;

    Ok(TrustedDealerKeyPackages {
        public_address: packages.public_address.hex_public_address(),
        public_key_package: bytes_to_hex(&public_key_package),
        view_key: packages.view_key.hex_key(),
        incoming_view_key: packages.incoming_view_key.hex_key(),
        outgoing_view_key: packages.outgoing_view_key.hex_key(),
        proof_authorizing_key: packages.proof_authorizing_key.hex_key(),
        key_packages,
    })
}

#[napi(object)]
pub struct ParticipantKeyPackage {
    pub identity: String,
    // TODO: this should contain the spender_key only, there's no need to return (and later store)
    // the entire key package, as all other information can be either derived or is stored
    // elsewhere (with the exception of min_signers, but that can be easily moved to
    // TrustedDealerKeyPackages)
    pub key_package: String,
}

#[napi(object)]
pub struct TrustedDealerKeyPackages {
    pub public_address: String,
    pub public_key_package: String,
    pub view_key: String,
    pub incoming_view_key: String,
    pub outgoing_view_key: String,
    pub proof_authorizing_key: String,
    pub key_packages: Vec<ParticipantKeyPackage>,
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

#[napi(js_name = "SigningCommitment")]
pub struct NativeSigningCommitment {
    signing_commitment: SigningCommitment,
}

#[napi]
impl NativeSigningCommitment {
    #[napi(constructor)]
    pub fn new(js_bytes: JsBuffer) -> Result<NativeSigningCommitment> {
        let bytes = js_bytes.into_value()?;
        SigningCommitment::deserialize_from(bytes.as_ref())
            .map(|signing_commitment| NativeSigningCommitment { signing_commitment })
            .map_err(to_napi_err)
    }

    #[napi]
    pub fn identity(&self) -> Buffer {
        Buffer::from(self.signing_commitment.identity().serialize().as_slice())
    }

    #[napi]
    pub fn verify_checksum(
        &self,
        transaction_hash: JsBuffer,
        signer_identities: Vec<String>,
    ) -> Result<bool> {
        let transaction_hash = transaction_hash.into_value()?;
        let signer_identities = try_deserialize_identities(signer_identities)?;
        Ok(self
            .signing_commitment
            .verify_checksum(&transaction_hash, &signer_identities)
            .is_ok())
    }
}

#[napi(js_name = "SigningPackage")]
pub struct NativeSigningPackage {
    signing_package: SigningPackage,
}

#[napi]
impl NativeSigningPackage {
    #[napi(constructor)]
    pub fn new(js_bytes: JsBuffer) -> Result<NativeSigningPackage> {
        let bytes = js_bytes.into_value()?;
        SigningPackage::read(bytes.as_ref())
            .map(|signing_package| NativeSigningPackage { signing_package })
            .map_err(to_napi_err)
    }

    #[napi]
    pub fn unsigned_transaction(&self) -> NativeUnsignedTransaction {
        NativeUnsignedTransaction {
            transaction: self.signing_package.unsigned_transaction.clone(),
        }
    }

    #[napi]
    pub fn signers(&self) -> Vec<Buffer> {
        self.signing_package
            .signers
            .iter()
            .map(|signer| Buffer::from(&signer.serialize()[..]))
            .collect()
    }
}
