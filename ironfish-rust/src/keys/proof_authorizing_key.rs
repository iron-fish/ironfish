/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use jubjub::Fr;

use crate::{
    errors::{IronfishError, IronfishErrorKind},
    serializing::{bytes_to_hex, hex_to_bytes},
};

pub type ProofAuthorizingKey = jubjub::Fr;

pub trait ProofAuthorizingKeySerializable {
    fn serialize(&self) -> [u8; 32];
    fn deserialize(bytes: [u8; 32]) -> Result<ProofAuthorizingKey, IronfishError>;
    fn hex_key(&self) -> String;
    fn from_hex(hex_key: &str) -> Result<ProofAuthorizingKey, IronfishError>;
}

impl ProofAuthorizingKeySerializable for ProofAuthorizingKey {
    fn serialize(&self) -> [u8; 32] {
        self.to_bytes()
    }

    fn deserialize(bytes: [u8; 32]) -> Result<Self, IronfishError> {
        let nsk = match Fr::from_bytes(&bytes).into() {
            Some(nsk) => nsk,
            None => {
                return Err(IronfishError::new(
                    IronfishErrorKind::InvalidProofAuthorizingKey,
                ))
            }
        };

        Ok(nsk)
    }

    fn hex_key(&self) -> String {
        bytes_to_hex(&self.serialize())
    }

    fn from_hex(hex_key: &str) -> Result<ProofAuthorizingKey, IronfishError> {
        let bytes = hex_to_bytes(hex_key)?;
        ProofAuthorizingKey::deserialize(bytes)
    }
}

#[cfg(test)]
mod test {
    use super::ProofAuthorizingKey;
    use super::ProofAuthorizingKeySerializable;
    use crate::errors::IronfishErrorKind;
    use ff::Field;
    use rand::{rngs::StdRng, SeedableRng};

    #[test]
    fn test_serialize() {
        let mut rng = StdRng::seed_from_u64(0);

        let proof_authorizing_key = ProofAuthorizingKey::random(&mut rng);

        let serialized_bytes = proof_authorizing_key.serialize();

        assert_eq!(serialized_bytes.len(), 32);
    }

    #[test]
    fn test_deserialize_error() {
        let mut proof_authorizing_key_bytes: [u8; 32] = [0; 32];
        proof_authorizing_key_bytes[0..32].fill(0xFF);

        let result = ProofAuthorizingKey::deserialize(proof_authorizing_key_bytes);

        assert!(result.is_err());

        let err = result.err().unwrap();

        assert!(matches!(
            err.kind,
            IronfishErrorKind::InvalidProofAuthorizingKey
        ));
    }

    #[test]
    fn test_deserialize() {
        let mut rng = StdRng::seed_from_u64(0);

        let proof_authorizing_key = ProofAuthorizingKey::random(&mut rng);

        let serialized_bytes = proof_authorizing_key.serialize();

        let deserialized_proof_authorizing_key =
            ProofAuthorizingKey::deserialize(serialized_bytes).expect("deserialization successful");

        assert_eq!(proof_authorizing_key, deserialized_proof_authorizing_key);
    }

    #[test]
    fn test_hex() {
        let mut rng = StdRng::seed_from_u64(0);

        let proof_authorizing_key = jubjub::Fr::random(&mut rng);

        let hex_key = proof_authorizing_key.hex_key();

        let deserialized_proof_authorizing_key =
            ProofAuthorizingKey::from_hex(&hex_key).expect("deserialization successful");

        assert_eq!(proof_authorizing_key, deserialized_proof_authorizing_key);
    }
}
