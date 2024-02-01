/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish_frost::frost::{
    self,
    keys::KeyPackage,
    round1::SigningNonces,
    round2::{Randomizer, SignatureShare},
    SigningPackage,
};
use rand::{rngs::StdRng, SeedableRng};

use crate::errors::{IronfishError, IronfishErrorKind};

// Wrapper around frost::round2::sign that provides a seedable rng from u64
pub fn create_signing_share(
    signing_package: SigningPackage,
    key_package: KeyPackage,
    randomizer: Randomizer,
    seed: u64,
) -> Result<SignatureShare, IronfishError> {
    let mut rng = StdRng::seed_from_u64(seed);
    let signer_nonces = SigningNonces::new(key_package.signing_share(), &mut rng);
    frost::round2::sign(&signing_package, &signer_nonces, &key_package, randomizer)
        .map_err(|_| IronfishError::new(IronfishErrorKind::RoundTwoSigningFailure))
}
