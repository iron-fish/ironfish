/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish_frost::frost::{
    self,
    keys::KeyPackage,
    round1::SigningNonces,
    round2::{Randomizer, SignatureShare as FrostSignatureShare},
    Identifier, SigningPackage,
};
use rand::{rngs::StdRng, SeedableRng};

use crate::errors::{IronfishError, IronfishErrorKind};

pub struct SignatureShare {
    pub identifier: Identifier,
    pub signature_share: FrostSignatureShare,
}

impl SignatureShare {
    pub fn serialize(&self) -> [u8; 64] {
        let identifier_bytes = self.identifier.serialize();
        let signature_share_bytes = self.signature_share.serialize();
        let mut combined: [u8; 64] = [0; 64];
        combined[..32].copy_from_slice(&identifier_bytes);
        combined[32..].copy_from_slice(&signature_share_bytes);
        combined
    }

    pub fn deserialize(bytes: &[u8; 64]) -> Result<SignatureShare, IronfishError> {
        let mut identifier_bytes = [0u8; 32];
        let mut signature_share_bytes = [0u8; 32];
        identifier_bytes.copy_from_slice(&bytes[..32]);
        signature_share_bytes.copy_from_slice(&bytes[32..]);

        Ok(SignatureShare {
            identifier: Identifier::deserialize(&identifier_bytes).map_err(|e| {
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

// Wrapper around frost::round2::sign that provides a seedable rng from u64
pub fn create_signature_share(
    signing_package: SigningPackage,
    identifier: Identifier,
    key_package: KeyPackage,
    randomizer: Randomizer,
    seed: u64,
) -> Result<SignatureShare, IronfishError> {
    let mut rng = StdRng::seed_from_u64(seed);
    let signer_nonces = SigningNonces::new(key_package.signing_share(), &mut rng);
    let signature_share =
        frost::round2::sign(&signing_package, &signer_nonces, &key_package, randomizer)
            .map_err(|_| IronfishError::new(IronfishErrorKind::RoundTwoSigningFailure))?;
    Ok(SignatureShare {
        identifier,
        signature_share,
    })
}
