/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::{IronfishError, IronfishErrorKind},
    IncomingViewKey, OutgoingViewKey, PublicAddress, SaplingKey, ViewKey,
};
use group::GroupEncoding;
use ironfish_frost::frost::VerifyingKey;
use ironfish_jubjub::SubgroupPoint;
use ironfish_zkp::constants::PROOF_GENERATION_KEY_GENERATOR;

pub struct MultisigAccountKeys {
    /// Equivalent to [`crate::keys::SaplingKey::proof_authorizing_key`]
    pub proof_authorizing_key: ironfish_jubjub::Fr,
    /// Equivalent to [`crate::keys::SaplingKey::outgoing_viewing_key`]
    pub outgoing_viewing_key: OutgoingViewKey,
    /// Equivalent to [`crate::keys::SaplingKey::view_key`]
    pub view_key: ViewKey,
    /// Equivalent to [`crate::keys::SaplingKey::incoming_viewing_key`]
    pub incoming_viewing_key: IncomingViewKey,
    /// Equivalent to [`crate::keys::SaplingKey::public_address`]
    pub public_address: PublicAddress,
}

/// Derives the account keys for a multisig account, realizing the following key hierarchy:
///
/// ```text
///                 ak ─┐
///                     ├─ ivk ── pk
///   gsk ── nsk ── nk ─┘
/// ```
pub fn derive_account_keys(
    authorizing_key: &VerifyingKey,
    group_secret_key: &[u8; 32],
) -> Result<MultisigAccountKeys, IronfishError> {
    // Group secret key (gsk), obtained from the multisig setup process
    let group_secret_key =
        SaplingKey::new(*group_secret_key).expect("failed to derive group secret key");

    // Authorization key (ak), obtained from the multisig setup process
    let mut bytes: [u8; 32] = [0; 32];
    bytes.copy_from_slice(&authorizing_key.serialize()?);
    let authorizing_key = Option::from(SubgroupPoint::from_bytes(&bytes)).ok_or(
        IronfishError::new_with_source(IronfishErrorKind::InvalidData, "invalid authorizing_key"),
    )?;

    // Nullifier keys (nsk and nk), derived from the gsk
    let proof_authorizing_key = group_secret_key.sapling_proof_generation_key().nsk;
    let nullifier_deriving_key = *PROOF_GENERATION_KEY_GENERATOR * proof_authorizing_key;

    // Incoming view key (ivk), derived from the ak and the nk
    let view_key = ViewKey {
        authorizing_key,
        nullifier_deriving_key,
    };
    let incoming_viewing_key = IncomingViewKey {
        view_key: SaplingKey::hash_viewing_key(&authorizing_key, &nullifier_deriving_key)?,
    };

    // Outgoing view key (ovk), derived from the gsk
    let outgoing_viewing_key = group_secret_key.outgoing_view_key().clone();

    // Public address (pk), derived from the ivk
    let public_address = incoming_viewing_key.public_address();

    Ok(MultisigAccountKeys {
        proof_authorizing_key,
        outgoing_viewing_key,
        view_key,
        incoming_viewing_key,
        public_address,
    })
}
