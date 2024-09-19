/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{structs::NativeUnsignedTransaction, to_napi_err};
use ironfish::{
    frost::{
        frost::{
            keys::PublicKeyPackage as FrostPublicKeyPackage, round1::SigningCommitments,
            round2::SignatureShare as FrostSignatureShare,
        },
        keys::KeyPackage,
        round2, Randomizer,
    },
    frost_utils::{
        account_keys::derive_account_keys, signing_package::SigningPackage,
        split_spender_key::split_spender_key,
    },
    participant::{Identity, Secret},
    serializing::{bytes_to_hex, fr::FrSerializable, hex_to_vec_bytes},
    SaplingKey,
};
use ironfish_frost::{
    dkg::{self, round3::PublicKeyPackage},
    multienc,
    nonces::deterministic_signing_nonces,
    signature_share::SignatureShare,
    signing_commitment::SigningCommitment,
};
use napi::{bindgen_prelude::*, JsBuffer};
use napi_derive::napi;
use rand::thread_rng;
use std::fmt::Display;
use std::ops::Deref;

#[napi(namespace = "multisig")]
pub const IDENTITY_LEN: u32 = ironfish::frost_utils::IDENTITY_LEN as u32;

#[napi(namespace = "multisig")]
pub const SECRET_LEN: u32 = ironfish_frost::participant::SECRET_LEN as u32;

fn try_deserialize<I, S, F, T, E>(items: I, deserialize_item: F) -> Result<Vec<T>>
where
    I: IntoIterator<Item = S>,
    S: Deref<Target = str>,
    E: Display,
    F: for<'a> Fn(&'a [u8]) -> std::result::Result<T, E>,
{
    items
        .into_iter()
        .try_fold(Vec::new(), |mut items, serialized_item| {
            let serialized_item = hex_to_vec_bytes(&serialized_item).map_err(to_napi_err)?;
            deserialize_item(&serialized_item[..])
                .map(|item| {
                    items.push(item);
                    items
                })
                .map_err(to_napi_err)
        })
}

#[inline]
fn try_deserialize_identities<I, S>(signers: I) -> Result<Vec<Identity>>
where
    I: IntoIterator<Item = S>,
    S: Deref<Target = str>,
{
    try_deserialize(signers, |bytes| Identity::deserialize_from(bytes))
}

#[napi(namespace = "multisig")]
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
    )
    .map_err(to_napi_err)?;

    let bytes = signing_commitment.serialize();
    Ok(bytes_to_hex(&bytes[..]))
}

#[napi(namespace = "multisig")]
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

#[napi(js_name = "SignatureShare", namespace = "multisig")]
pub struct NativeSignatureShare {
    signature_share: SignatureShare,
}

#[napi(namespace = "multisig")]
impl NativeSignatureShare {
    #[napi(constructor)]
    pub fn new(js_bytes: JsBuffer) -> Result<NativeSignatureShare> {
        let bytes = js_bytes.into_value()?;
        SignatureShare::deserialize_from(bytes.as_ref())
            .map(|signature_share| NativeSignatureShare { signature_share })
            .map_err(to_napi_err)
    }

    #[napi(factory)]
    pub fn from_frost(
        frost_signature_share: JsBuffer,
        identity: JsBuffer,
    ) -> Result<NativeSignatureShare> {
        let frost_signature_share = frost_signature_share.into_value()?;
        let frost_signature_share =
            FrostSignatureShare::deserialize(frost_signature_share.as_ref())
                .map_err(to_napi_err)?;

        let identity = identity.into_value()?;
        let identity = Identity::deserialize_from(&identity[..]).map_err(to_napi_err)?;

        let signature_share = SignatureShare::from_frost(frost_signature_share, identity);

        Ok(NativeSignatureShare { signature_share })
    }

    #[napi]
    pub fn identity(&self) -> Buffer {
        Buffer::from(self.signature_share.identity().serialize().as_slice())
    }

    #[napi]
    pub fn frost_signature_share(&self) -> Buffer {
        Buffer::from(
            self.signature_share
                .frost_signature_share()
                .serialize()
                .as_slice(),
        )
    }

    #[napi]
    pub fn serialize(&self) -> Buffer {
        Buffer::from(self.signature_share.serialize().as_slice())
    }
}

#[napi(namespace = "multisig")]
pub struct ParticipantSecret {
    secret: Secret,
}

#[napi(namespace = "multisig")]
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
        multienc::decrypt(&self.secret, &bytes)
            .map(Buffer::from)
            .map_err(to_napi_err)
    }

    #[napi]
    pub fn decrypt_legacy_data(&self, js_bytes: JsBuffer) -> Result<Buffer> {
        let bytes = js_bytes.into_value()?;
        let encrypted_blob =
            multienc::MultiRecipientBlob::deserialize_from(bytes.as_ref()).map_err(to_napi_err)?;
        multienc::decrypt_legacy(&self.secret, &encrypted_blob)
            .map(Buffer::from)
            .map_err(to_napi_err)
    }
}

#[napi(namespace = "multisig")]
pub struct ParticipantIdentity {
    identity: Identity,
}

#[napi(namespace = "multisig")]
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
        Ok(Buffer::from(multienc::encrypt(
            &bytes,
            [&self.identity],
            thread_rng(),
        )))
    }
}

#[napi(namespace = "multisig")]
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

    let public_key_package = packages.public_key_package.serialize();

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

#[napi(object, namespace = "multisig")]
pub struct ParticipantKeyPackage {
    pub identity: String,
    // TODO: this should contain the spender_key only, there's no need to return (and later store)
    // the entire key package, as all other information can be either derived or is stored
    // elsewhere (with the exception of min_signers, but that can be easily moved to
    // TrustedDealerKeyPackages)
    pub key_package: String,
}

#[napi(object, namespace = "multisig")]
pub struct TrustedDealerKeyPackages {
    pub public_address: String,
    pub public_key_package: String,
    pub view_key: String,
    pub incoming_view_key: String,
    pub outgoing_view_key: String,
    pub proof_authorizing_key: String,
    pub key_packages: Vec<ParticipantKeyPackage>,
}

#[napi(js_name = "PublicKeyPackage", namespace = "multisig")]
pub struct NativePublicKeyPackage {
    public_key_package: PublicKeyPackage,
}

#[napi(namespace = "multisig")]
impl NativePublicKeyPackage {
    #[napi(constructor)]
    pub fn new(value: String) -> Result<NativePublicKeyPackage> {
        let bytes = hex_to_vec_bytes(&value).map_err(to_napi_err)?;

        let public_key_package =
            PublicKeyPackage::deserialize_from(&bytes[..]).map_err(to_napi_err)?;

        Ok(NativePublicKeyPackage { public_key_package })
    }

    #[napi(factory)]
    pub fn from_frost(
        frost_public_key_package: JsBuffer,
        identities: Vec<String>,
        min_signers: u16,
    ) -> Result<NativePublicKeyPackage> {
        let frost_public_key_package =
            FrostPublicKeyPackage::deserialize(frost_public_key_package.into_value()?.as_ref())
                .map_err(to_napi_err)?;
        let identities = try_deserialize_identities(identities)?;

        let public_key_package =
            PublicKeyPackage::from_frost(frost_public_key_package, identities, min_signers);

        Ok(NativePublicKeyPackage { public_key_package })
    }

    #[napi]
    pub fn serialize(&self) -> Buffer {
        Buffer::from(self.public_key_package.serialize())
    }

    #[napi]
    pub fn identities(&self) -> Vec<Buffer> {
        self.public_key_package
            .identities()
            .iter()
            .map(|identity| Buffer::from(&identity.serialize()[..]))
            .collect()
    }

    #[napi]
    pub fn frost_public_key_package(&self) -> Result<Buffer> {
        Ok(Buffer::from(
            self.public_key_package
                .frost_public_key_package()
                .serialize()
                .map_err(to_napi_err)?
                .as_slice(),
        ))
    }

    #[napi]
    pub fn min_signers(&self) -> u16 {
        self.public_key_package.min_signers()
    }
}

#[napi(js_name = "SigningCommitment", namespace = "multisig")]
pub struct NativeSigningCommitment {
    signing_commitment: SigningCommitment,
}

#[napi(namespace = "multisig")]
impl NativeSigningCommitment {
    #[napi(constructor)]
    pub fn new(js_bytes: JsBuffer) -> Result<NativeSigningCommitment> {
        let bytes = js_bytes.into_value()?;
        SigningCommitment::deserialize_from(bytes.as_ref())
            .map(|signing_commitment| NativeSigningCommitment { signing_commitment })
            .map_err(to_napi_err)
    }

    #[napi(factory)]
    pub fn from_raw(
        identity: String,
        raw_commitments: JsBuffer,
        transaction_hash: JsBuffer,
        signers: Vec<String>,
    ) -> Result<NativeSigningCommitment> {
        let identity =
            Identity::deserialize_from(&hex_to_vec_bytes(&identity).map_err(to_napi_err)?[..])
                .map_err(to_napi_err)?;

        let raw_commitments =
            SigningCommitments::deserialize(raw_commitments.into_value()?.as_ref())
                .map_err(to_napi_err)?;

        let signers = try_deserialize_identities(signers)?;

        let signing_commitment = SigningCommitment::from_raw(
            raw_commitments,
            identity,
            transaction_hash.into_value()?.as_ref(),
            &signers[..],
        )
        .map_err(to_napi_err)?;

        Ok(NativeSigningCommitment { signing_commitment })
    }

    #[napi]
    pub fn serialize(&self) -> Buffer {
        Buffer::from(self.signing_commitment.serialize().as_slice())
    }

    #[napi]
    pub fn identity(&self) -> Buffer {
        Buffer::from(self.signing_commitment.identity().serialize().as_slice())
    }

    #[napi]
    pub fn raw_commitments(&self) -> Result<Buffer> {
        Ok(Buffer::from(
            self.signing_commitment
                .raw_commitments()
                .serialize()
                .map_err(to_napi_err)?
                .as_slice(),
        ))
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

#[napi(js_name = "SigningPackage", namespace = "multisig")]
pub struct NativeSigningPackage {
    signing_package: SigningPackage,
}

#[napi(namespace = "multisig")]
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

    #[napi]
    pub fn frost_signing_package(&self) -> Result<Buffer> {
        Ok(Buffer::from(
            &self
                .signing_package
                .frost_signing_package
                .serialize()
                .map_err(to_napi_err)?[..],
        ))
    }
}

#[napi(namespace = "multisig")]
pub fn dkg_round1(
    self_identity: String,
    min_signers: u16,
    participant_identities: Vec<String>,
) -> Result<DkgRound1Packages> {
    let self_identity =
        Identity::deserialize_from(&hex_to_vec_bytes(&self_identity).map_err(to_napi_err)?[..])?;
    let participant_identities = try_deserialize_identities(participant_identities)?;

    let (round1_secret_package, round1_public_package) = dkg::round1::round1(
        &self_identity,
        min_signers,
        &participant_identities,
        thread_rng(),
    )
    .map_err(to_napi_err)?;

    Ok(DkgRound1Packages {
        round1_secret_package: bytes_to_hex(&round1_secret_package),
        round1_public_package: bytes_to_hex(&round1_public_package.serialize()),
    })
}

#[napi(object, namespace = "multisig")]
pub struct DkgRound1Packages {
    pub round1_secret_package: String,
    pub round1_public_package: String,
}

#[napi(namespace = "multisig")]
pub fn dkg_round2(
    secret: String,
    round1_secret_package: String,
    round1_public_packages: Vec<String>,
) -> Result<DkgRound2Packages> {
    let secret = Secret::deserialize_from(&hex_to_vec_bytes(&secret).map_err(to_napi_err)?[..])?;
    let round1_public_packages = try_deserialize(round1_public_packages, |bytes| {
        dkg::round1::PublicPackage::deserialize_from(bytes)
    })?;
    let round1_secret_package = hex_to_vec_bytes(&round1_secret_package).map_err(to_napi_err)?;

    let (round2_secret_package, round2_public_package) = dkg::round2::round2(
        &secret,
        &round1_secret_package,
        &round1_public_packages,
        thread_rng(),
    )
    .map_err(to_napi_err)?;

    Ok(DkgRound2Packages {
        round2_secret_package: bytes_to_hex(&round2_secret_package),
        round2_public_package: bytes_to_hex(&round2_public_package.serialize()),
    })
}

#[napi(object, namespace = "multisig")]
pub struct DkgRound2Packages {
    pub round2_secret_package: String,
    pub round2_public_package: String,
}

#[napi(namespace = "multisig")]
pub fn dkg_round3(
    secret: &ParticipantSecret,
    round2_secret_package: String,
    round1_public_packages: Vec<String>,
    round2_public_packages: Vec<String>,
) -> Result<DkgRound3Packages> {
    let round2_secret_package = hex_to_vec_bytes(&round2_secret_package).map_err(to_napi_err)?;
    let round1_public_packages = try_deserialize(round1_public_packages, |bytes| {
        dkg::round1::PublicPackage::deserialize_from(bytes)
    })?;
    let round2_public_packages = try_deserialize(round2_public_packages, |bytes| {
        dkg::round2::CombinedPublicPackage::deserialize_from(bytes)
    })?;

    let (key_package, public_key_package, group_secret_key) = dkg::round3::round3(
        &secret.secret,
        &round2_secret_package,
        round1_public_packages.iter(),
        round2_public_packages.iter(),
    )
    .map_err(to_napi_err)?;

    let account_keys = derive_account_keys(public_key_package.verifying_key(), &group_secret_key)
        .map_err(to_napi_err)?;

    Ok(DkgRound3Packages {
        public_address: account_keys.public_address.hex_public_address(),
        key_package: bytes_to_hex(&key_package.serialize().map_err(to_napi_err)?),
        public_key_package: bytes_to_hex(&public_key_package.serialize()),
        view_key: account_keys.view_key.hex_key(),
        incoming_view_key: account_keys.incoming_viewing_key.hex_key(),
        outgoing_view_key: account_keys.outgoing_viewing_key.hex_key(),
        proof_authorizing_key: account_keys.proof_authorizing_key.hex_key(),
    })
}

#[napi(object)]
pub struct PublicPackage {
    pub identity: String,
    pub frost_package: String,
    pub group_secret_key_shard_encrypted: String,
    pub checksum: String,
}

#[napi]
pub fn deserialize_public_package(round1_public_package: String) -> Result<PublicPackage> {
    let serialized_item = hex_to_vec_bytes(&round1_public_package).map_err(to_napi_err)?;
    let pkg =
        dkg::round1::PublicPackage::deserialize_from(&serialized_item[..]).map_err(to_napi_err)?;

    Ok(PublicPackage {
        identity: pkg.identity().to_string(),
        frost_package: bytes_to_hex(&pkg.frost_package().serialize().map_err(to_napi_err)?),
        group_secret_key_shard_encrypted: bytes_to_hex(pkg.group_secret_key_shard_encrypted()),
        checksum: pkg.checksum().to_string(),
    })
}

#[napi(object)]
pub struct Round2PublicPackage {
    pub sender_identity: String,
    pub recipient_identity: String,
    pub frost_package: String,
    pub checksum: String,
}

#[napi(object)]
pub struct Round2CombinedPublicPackage {
    pub packages: Vec<Round2PublicPackage>,
}

#[napi]
pub fn deserialize_round2_combined_public_package(
    round2_combined_public_package: String,
) -> Result<Round2CombinedPublicPackage> {
    let serialized_item = hex_to_vec_bytes(&round2_combined_public_package).map_err(to_napi_err)?;
    let pkg = dkg::round2::CombinedPublicPackage::deserialize_from(&serialized_item[..])
        .map_err(to_napi_err)?;

    let mut packages: Vec<Round2PublicPackage> = Vec::new();

    for round2_public_package in pkg.packages() {
        packages.push(Round2PublicPackage {
            sender_identity: round2_public_package.sender_identity().to_string(),
            recipient_identity: round2_public_package.recipient_identity().to_string(),
            frost_package: bytes_to_hex(
                &round2_public_package
                    .frost_package()
                    .serialize()
                    .map_err(to_napi_err)?,
            ),
            checksum: round2_public_package.checksum().to_string(),
        })
    }

    Ok(Round2CombinedPublicPackage { packages })
}
#[napi(object, namespace = "multisig")]
pub struct DkgRound3Packages {
    pub public_address: String,
    pub key_package: String,
    pub public_key_package: String,
    pub view_key: String,
    pub incoming_view_key: String,
    pub outgoing_view_key: String,
    pub proof_authorizing_key: String,
}
