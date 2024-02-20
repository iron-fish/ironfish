/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish_frost::{
    frost::round2::SignatureShare as FrostSignatureShare,
    participant::{Identity, IDENTITY_LEN},
};

use crate::errors::{IronfishError, IronfishErrorKind};

const FROST_SIGNATURE_SHARE_LEN: usize = 32;
const SIGNATURE_SHARE_LEN: usize = IDENTITY_LEN + FROST_SIGNATURE_SHARE_LEN;

type SignatureShareSerialization = [u8; SIGNATURE_SHARE_LEN];

pub struct SignatureShare {
    pub identity: Identity,
    pub signature_share: FrostSignatureShare,
}

impl SignatureShare {
    pub fn serialize(&self) -> SignatureShareSerialization {
        let identity_bytes = self.identity.serialize();
        let signature_share_bytes = self.signature_share.serialize();
        let mut serialization = [0u8; SIGNATURE_SHARE_LEN];
        serialization[..IDENTITY_LEN].copy_from_slice(&identity_bytes);
        serialization[IDENTITY_LEN..].copy_from_slice(&signature_share_bytes);
        serialization
    }

    pub fn deserialize(bytes: &SignatureShareSerialization) -> Result<Self, IronfishError> {
        let mut identity_bytes = [0u8; IDENTITY_LEN];
        let mut signature_share_bytes = [0u8; FROST_SIGNATURE_SHARE_LEN];
        identity_bytes.copy_from_slice(&bytes[..IDENTITY_LEN]);
        signature_share_bytes.copy_from_slice(&bytes[IDENTITY_LEN..]);

        Ok(SignatureShare {
            identity: Identity::deserialize_from(&identity_bytes[..]).map_err(|e| {
                IronfishError::new_with_source(IronfishErrorKind::InvalidFrostIdentifier, e)
            })?,
            signature_share: FrostSignatureShare::deserialize(signature_share_bytes).map_err(
                |e| {
                    IronfishError::new_with_source(IronfishErrorKind::InvalidFrostSignatureShare, e)
                },
            )?,
        })
    }
}
