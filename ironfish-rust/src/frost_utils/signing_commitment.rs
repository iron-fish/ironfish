/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::io;

use ironfish_frost::frost::{
    self,
    frost::round1::NonceCommitment,
    keys::KeyPackage,
    round1::{SigningCommitments, SigningNonces},
    Identifier, JubjubBlake2b512,
};
use rand::{rngs::StdRng, SeedableRng};

use crate::errors::IronfishError;

pub const SIGNING_COMMITMENT_LENGTH: usize = 96;

#[derive(Clone)]
pub struct SigningCommitment {
    pub identifier: Identifier,

    pub hiding: NonceCommitment<JubjubBlake2b512>,

    pub binding: NonceCommitment<JubjubBlake2b512>,
}

impl SigningCommitment {
    pub fn serialize(&self) -> [u8; SIGNING_COMMITMENT_LENGTH] {
        let mut bytes = [0u8; SIGNING_COMMITMENT_LENGTH];
        self.write(&mut bytes[..]).unwrap();
        bytes
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let mut identifier = [0u8; 32];
        reader.read_exact(&mut identifier)?;
        let identifier = Identifier::deserialize(&identifier)?;

        let mut hiding = [0u8; 32];
        reader.read_exact(&mut hiding)?;
        let hiding = NonceCommitment::deserialize(hiding)?;

        let mut binding = [0u8; 32];
        reader.read_exact(&mut binding)?;
        let binding = NonceCommitment::deserialize(binding)?;

        Ok(SigningCommitment {
            identifier,
            hiding,
            binding,
        })
    }

    fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        writer.write_all(&self.identifier.serialize())?;
        writer.write_all(&self.hiding.serialize())?;
        writer.write_all(&self.binding.serialize())?;
        Ok(())
    }
}

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
    use rand::thread_rng;

    #[test]
    pub fn test_seed_provides_same_result() {
        let seed = 100;
        let key = Fr::random(&mut rand::thread_rng());

        let identifiers = create_identifiers(10);

        let key_packages = split_secret(
            &SecretShareConfig {
                identifiers,
                min_signers: 2,
                secret: key.to_bytes().to_vec(),
            },
            thread_rng(),
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
