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
pub fn round_one(key_package: &KeyPackage, seed: u64) -> (SigningNonces, SigningCommitments) {
    let mut rng = StdRng::seed_from_u64(seed);
    frost::round1::commit(key_package.signing_share(), &mut rng)
}

#[cfg(test)]
mod test {

    use ff::Field;
    use ironfish_frost::frost::keys::IdentifierList;
    use jubjub::Fr;
    use rand::rngs::ThreadRng;

    use crate::transaction::{split_secret, SecretShareConfig};

    #[test]
    pub fn test_seed_provides_same_result() {
        let seed = 100;
        let key = Fr::random(&mut rand::thread_rng());

        let mut rng = ThreadRng::default();
        let key_packages = split_secret(
            &SecretShareConfig {
                max_signers: 3,
                min_signers: 2,
                secret: key.to_bytes().to_vec(),
            },
            IdentifierList::Default,
            &mut rng,
        )
        .expect("key shares to be created");
        let key_package = key_packages
            .0
            .into_iter()
            .next()
            .expect("key package to be created")
            .1;
        let (nonces, commitments) = super::round_one(&key_package, seed);
        let (nonces2, commitments2) = super::round_one(&key_package, seed);
        assert_eq!(nonces.hiding().serialize(), nonces2.hiding().serialize());
        assert_eq!(nonces.binding().serialize(), nonces2.binding().serialize());
        assert_eq!(commitments, commitments2);
    }
}
