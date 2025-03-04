/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::errors::{IronfishError, IronfishErrorKind};
use ff::Field;
use ironfish_zkp::constants::PUBLIC_KEY_GENERATOR;
use rand::thread_rng;
use std::io;

/// Diffie Hellman key exchange pair as used in note encryption.
///
/// This can be used according to the protocol described in
/// [`crate::keys::shared_secret`]
#[derive(Default, Clone, PartialEq, Eq, Debug)]
pub struct EphemeralKeyPair {
    secret: ironfish_jubjub::Fr,
    public: ironfish_jubjub::SubgroupPoint,
}

impl EphemeralKeyPair {
    pub fn new() -> Self {
        loop {
            let secret = ironfish_jubjub::Fr::random(thread_rng());
            if let Ok(key_pair) = Self::from_secret(secret) {
                break key_pair;
            }
        }
    }

    pub fn from_secret(secret: ironfish_jubjub::Fr) -> Result<Self, IronfishError> {
        if secret == ironfish_jubjub::Fr::zero() || secret == ironfish_jubjub::Fr::one() {
            return Err(IronfishError::new(IronfishErrorKind::InvalidSecret));
        }
        Ok(Self {
            secret,
            public: *PUBLIC_KEY_GENERATOR * secret,
        })
    }

    pub fn secret(&self) -> &ironfish_jubjub::Fr {
        &self.secret
    }

    pub fn public(&self) -> &ironfish_jubjub::SubgroupPoint {
        &self.public
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let mut secret_bytes = [0u8; 32];
        reader.read_exact(&mut secret_bytes)?;
        let secret = Option::from(ironfish_jubjub::Fr::from_bytes(&secret_bytes))
            .ok_or_else(|| IronfishError::new(IronfishErrorKind::InvalidData))?;
        Self::from_secret(secret)
    }

    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        let secret_bytes = self.secret.to_bytes();
        writer.write_all(&secret_bytes)?;
        Ok(())
    }
}

#[cfg(test)]
mod test {
    use ironfish_zkp::constants::PUBLIC_KEY_GENERATOR;

    use super::EphemeralKeyPair;

    #[test]
    fn test_ephemeral_key_pair() {
        let key_pair = EphemeralKeyPair::new();

        assert_eq!(
            *key_pair.public(),
            *PUBLIC_KEY_GENERATOR * key_pair.secret()
        );

        assert_eq!(key_pair.public(), &key_pair.public);
        assert_eq!(key_pair.secret(), &key_pair.secret);
    }
}
