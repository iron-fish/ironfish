/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::io;

use ironfish_frost::{
    frost::round1::NonceCommitment,
    participant::{Identity, IDENTITY_LEN},
};

use crate::errors::IronfishError;

const SIGNING_COMMITMENT_LENGTH: usize = IDENTITY_LEN + 96;

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct SigningCommitment {
    pub identity: Identity,
    pub hiding: NonceCommitment,
    pub binding: NonceCommitment,
}

impl SigningCommitment {
    pub fn serialize(&self) -> [u8; SIGNING_COMMITMENT_LENGTH] {
        let mut bytes = [0u8; SIGNING_COMMITMENT_LENGTH];
        self.write(&mut bytes[..]).unwrap();
        bytes
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let identity = Identity::deserialize_from(&mut reader)?;

        let mut hiding = [0u8; 32];
        reader.read_exact(&mut hiding)?;
        let hiding = NonceCommitment::deserialize(hiding)?;

        let mut binding = [0u8; 32];
        reader.read_exact(&mut binding)?;
        let binding = NonceCommitment::deserialize(binding)?;

        Ok(SigningCommitment {
            identity,
            hiding,
            binding,
        })
    }

    fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        writer.write_all(&self.identity.serialize())?;
        writer.write_all(&self.hiding.serialize())?;
        writer.write_all(&self.binding.serialize())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::SigningCommitment;
    use ironfish_frost::{
        frost::{keys::SigningShare, round1::SigningNonces},
        participant::Secret,
    };
    use rand::thread_rng;

    #[test]
    fn serialization_round_trip() {
        let mut rng = thread_rng();

        let signing_share = SigningShare::default();
        let identity = Secret::random(&mut rng).to_identity();
        let nonces = SigningNonces::new(&signing_share, &mut rng);

        let signing_commitment = SigningCommitment {
            identity,
            hiding: nonces.hiding().into(),
            binding: nonces.binding().into(),
        };
        let serialized = signing_commitment.serialize();
        let deserialized =
            SigningCommitment::read(&serialized[..]).expect("deserialization failed");

        assert_eq!(deserialized, signing_commitment);
    }
}
