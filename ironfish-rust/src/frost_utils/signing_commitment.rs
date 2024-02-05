/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish_frost::frost::{
    self,
    keys::KeyPackage,
    round1::{SigningCommitments, SigningNonces},
};
use rand::{rngs::StdRng, SeedableRng};

// Small wrapper around frost::round1::commit that provides a seedable rng
pub fn create_signing_commitment(
    key_package: &KeyPackage,
    seed: u64,
) -> (SigningNonces, SigningCommitments) {
    let mut rng = StdRng::seed_from_u64(seed);
    frost::round1::commit(key_package.signing_share(), &mut rng)
}

#[cfg(test)]
mod test {
    use crate::frost_utils::split_secret::{split_secret, SecretShareConfig};
    use crate::test_util::create_identifiers;
    use ff::Field;
    use jubjub::Fr;
    use rand::rngs::ThreadRng;

    #[test]
    pub fn test_seed_provides_same_result() {
        let seed = 100;
        let key = Fr::random(&mut rand::thread_rng());

        let identifiers = create_identifiers(10);

        let mut rng = ThreadRng::default();
        let key_packages = split_secret(
            &SecretShareConfig {
                identifiers,
                min_signers: 2,
                secret: key.to_bytes().to_vec(),
            },
            &mut rng,
        )
        .expect("key shares to be created");
        let key_package = key_packages
            .0
            .into_iter()
            .next()
            .expect("key package to be created")
            .1;
        let (nonces, commitments) = super::create_signing_commitment(&key_package, seed);
        let (nonces2, commitments2) = super::create_signing_commitment(&key_package, seed);
        assert_eq!(nonces.hiding().serialize(), nonces2.hiding().serialize());
        assert_eq!(nonces.binding().serialize(), nonces2.binding().serialize());
        assert_eq!(commitments, commitments2);
    }
}
