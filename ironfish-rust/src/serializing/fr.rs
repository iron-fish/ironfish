/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::errors::{IronfishError, IronfishErrorKind};
use ironfish_jubjub::Fr;

use super::{bytes_to_hex, hex_to_bytes};

pub trait FrSerializable {
    fn serialize(&self) -> [u8; 32];
    fn deserialize(bytes: [u8; 32]) -> Result<Fr, IronfishError>;
    fn hex_key(&self) -> String;
    fn from_hex(hex_key: &str) -> Result<Fr, IronfishError>;
}

impl FrSerializable for Fr {
    fn serialize(&self) -> [u8; 32] {
        self.to_bytes()
    }

    fn deserialize(bytes: [u8; 32]) -> Result<Self, IronfishError> {
        let fr = match Fr::from_bytes(&bytes).into() {
            Some(fr) => fr,
            None => return Err(IronfishError::new(IronfishErrorKind::InvalidFr)),
        };

        Ok(fr)
    }

    fn hex_key(&self) -> String {
        bytes_to_hex(&self.serialize())
    }

    fn from_hex(hex_key: &str) -> Result<Fr, IronfishError> {
        let bytes = hex_to_bytes(hex_key)?;
        Fr::deserialize(bytes)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::errors::IronfishErrorKind;
    use ff::Field;
    use rand::{rngs::StdRng, SeedableRng};

    #[test]
    fn test_serialize() {
        let mut rng = StdRng::seed_from_u64(0);

        let fr = Fr::random(&mut rng);

        let serialized_bytes = fr.serialize();

        assert_eq!(serialized_bytes.len(), 32);
    }

    #[test]
    fn test_deserialize_error() {
        let mut bytes: [u8; 32] = [0; 32];
        bytes[0..32].fill(0xFF);

        let result = Fr::deserialize(bytes);

        assert!(result.is_err());

        let err = result.err().unwrap();

        assert!(matches!(err.kind, IronfishErrorKind::InvalidFr));
    }

    #[test]
    fn test_deserialize() {
        let mut rng = StdRng::seed_from_u64(0);

        let fr = Fr::random(&mut rng);

        let serialized_bytes = fr.serialize();

        let deserialized_fr =
            Fr::deserialize(serialized_bytes).expect("deserialization successful");

        assert_eq!(fr, deserialized_fr);
    }

    #[test]
    fn test_hex() {
        let mut rng = StdRng::seed_from_u64(0);

        let fr = ironfish_jubjub::Fr::random(&mut rng);

        let hex_key = fr.hex_key();

        let deserialized_fr = Fr::from_hex(&hex_key).expect("deserialization successful");

        assert_eq!(fr, deserialized_fr);
    }
}
