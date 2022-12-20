/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use ff::Field;
use ironfish_zkp::constants::PUBLIC_KEY_GENERATOR;
use rand::thread_rng;

/// Diffie Hellman key exchange pair as used in note encryption.
///
/// This can be used according to the protocol described in
/// [`crate::keys::shared_secret`]
#[derive(Default)]
pub struct EphemeralKeyPair {
    secret: jubjub::Fr,
    public: jubjub::SubgroupPoint,
}

impl EphemeralKeyPair {
    pub fn new() -> Self {
        let secret = jubjub::Fr::random(thread_rng());

        Self {
            secret,
            public: PUBLIC_KEY_GENERATOR * secret,
        }
    }

    pub fn secret(&self) -> &jubjub::Fr {
        &self.secret
    }

    pub fn public(&self) -> &jubjub::SubgroupPoint {
        &self.public
    }
}

#[cfg(test)]
mod test {
    use ironfish_zkp::constants::PUBLIC_KEY_GENERATOR;

    use super::EphemeralKeyPair;

    #[test]
    fn test_ephemeral_key_pair() {
        let key_pair = EphemeralKeyPair::new();

        assert_eq!(*key_pair.public(), PUBLIC_KEY_GENERATOR * key_pair.secret());

        assert_eq!(key_pair.public(), &key_pair.public);
        assert_eq!(key_pair.secret(), &key_pair.secret);
    }
}
