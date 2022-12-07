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
