use group::GroupEncoding;
use ironfish_jubjub::{Fr, SubgroupPoint};
use ironfish_primitives::sapling::ProofGenerationKey as ZcashProofGenerationKey;
use std::error::Error;
use std::fmt;
use std::ops::Deref;

use crate::hex::{bytes_to_hex, hex_to_bytes};

#[derive(Debug)]
pub enum ProofGenerationKeyError {
    InvalidAuthorizingKey,
    InvalidLength,
    InvalidNullifierDerivingKey,
    HexConversionError,
}

impl fmt::Display for ProofGenerationKeyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProofGenerationKeyError::InvalidAuthorizingKey => write!(f, "Invalid authorizing key"),
            ProofGenerationKeyError::InvalidNullifierDerivingKey => {
                write!(f, "Invalid nullifier deriving key")
            }
            ProofGenerationKeyError::HexConversionError => write!(f, "Hex conversion error"),
            ProofGenerationKeyError::InvalidLength => write!(f, "Invalid length"),
        }
    }
}

impl Error for ProofGenerationKeyError {}

#[derive(Clone)]
pub struct ProofGenerationKey(ZcashProofGenerationKey);

impl ProofGenerationKey {
    pub fn new(ak: SubgroupPoint, nsk: Fr) -> Self {
        ProofGenerationKey(ZcashProofGenerationKey { ak, nsk })
    }

    pub fn to_bytes(&self) -> [u8; 64] {
        let mut proof_generation_key_bytes: [u8; 64] = [0; 64];
        proof_generation_key_bytes[0..32].copy_from_slice(&self.0.ak.to_bytes());
        proof_generation_key_bytes[32..].copy_from_slice(&self.0.nsk.to_bytes());
        proof_generation_key_bytes
    }

    pub fn from_bytes(proof_generation_key_bytes: &[u8]) -> Result<Self, ProofGenerationKeyError> {
        if proof_generation_key_bytes.len() != 64 {
            return Err(ProofGenerationKeyError::InvalidLength);
        }
        let mut ak_bytes: [u8; 32] = [0; 32];
        let mut nsk_bytes: [u8; 32] = [0; 32];

        ak_bytes[0..32].copy_from_slice(&proof_generation_key_bytes[0..32]);
        nsk_bytes[0..32].copy_from_slice(&proof_generation_key_bytes[32..64]);

        let ak = match SubgroupPoint::from_bytes(&ak_bytes).into() {
            Some(ak) => ak,
            None => return Err(ProofGenerationKeyError::InvalidAuthorizingKey),
        };

        let nsk = match Fr::from_bytes(&nsk_bytes).into() {
            Some(nsk) => nsk,
            None => return Err(ProofGenerationKeyError::InvalidNullifierDerivingKey),
        };

        Ok(ProofGenerationKey(ZcashProofGenerationKey { ak, nsk }))
    }

    pub fn read<R: std::io::Read>(mut reader: R) -> Result<Self, std::io::Error> {
        let mut proof_generation_key_bytes: [u8; 64] = [0; 64];
        reader.read_exact(&mut proof_generation_key_bytes)?;
        ProofGenerationKey::from_bytes(&proof_generation_key_bytes)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
    }

    pub fn hex_key(&self) -> String {
        bytes_to_hex(&self.to_bytes())
    }

    pub fn from_hex(hex_key: &str) -> Result<ProofGenerationKey, ProofGenerationKeyError> {
        let bytes: [u8; 64] =
            hex_to_bytes(hex_key).map_err(|_| ProofGenerationKeyError::HexConversionError)?;
        ProofGenerationKey::from_bytes(&bytes)
    }
}

impl Deref for ProofGenerationKey {
    type Target = ZcashProofGenerationKey;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl From<ZcashProofGenerationKey> for ProofGenerationKey {
    fn from(key: ZcashProofGenerationKey) -> Self {
        ProofGenerationKey(key)
    }
}

impl PartialEq for ProofGenerationKey {
    fn eq(&self, other: &Self) -> bool {
        self.to_bytes() == other.to_bytes()
    }
}

impl Eq for ProofGenerationKey {}

impl fmt::Debug for ProofGenerationKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Hide all private keys
        f.debug_struct("ProofGenerationKey").finish_non_exhaustive()
    }
}

#[cfg(test)]
mod test {
    use ff::Field;
    use group::{Group, GroupEncoding};

    use ironfish_jubjub;
    use rand::{rngs::StdRng, SeedableRng};

    use crate::primitives::proof_generation_key::{ProofGenerationKey, ProofGenerationKeyError};

    #[test]
    fn test_serialize() {
        let mut rng = StdRng::seed_from_u64(0);

        let proof_generation_key = ProofGenerationKey::new(
            ironfish_jubjub::SubgroupPoint::random(&mut rng),
            ironfish_jubjub::Fr::random(&mut rng),
        );

        let serialized_bytes = proof_generation_key.to_bytes();

        assert_eq!(serialized_bytes.len(), 64);
    }

    #[test]
    fn test_deserialize_ak_error() {
        let mut proof_generation_key_bytes: [u8; 64] = [0; 64];
        proof_generation_key_bytes[0..32].fill(0xFF);

        let result = ProofGenerationKey::from_bytes(&proof_generation_key_bytes);

        assert!(result.is_err());

        let err = result.err().unwrap();

        assert!(matches!(
            err,
            ProofGenerationKeyError::InvalidAuthorizingKey
        ));
    }

    #[test]
    fn test_deserialize_nsk_error() {
        let mut proof_generation_key_bytes: [u8; 64] = [0; 64];
        // Populate with valid bytes for ak and invalid bytes for nsk
        let valid_ak = ironfish_jubjub::SubgroupPoint::random(&mut StdRng::seed_from_u64(0));
        proof_generation_key_bytes[0..32].copy_from_slice(&valid_ak.to_bytes()); // Assuming these are valid bytes for ak
        proof_generation_key_bytes[32..64].fill(0xFF); // Invalid bytes for nsk

        let result = ProofGenerationKey::from_bytes(&proof_generation_key_bytes);

        assert!(result.is_err());

        let err = result.err().unwrap();

        assert!(matches!(
            err,
            ProofGenerationKeyError::InvalidNullifierDerivingKey
        ));
    }

    #[test]
    fn test_deserialize() {
        let mut rng = StdRng::seed_from_u64(0);

        let proof_generation_key = ProofGenerationKey::new(
            ironfish_jubjub::SubgroupPoint::random(&mut rng),
            ironfish_jubjub::Fr::random(&mut rng),
        );

        let serialized_bytes = proof_generation_key.to_bytes();

        let deserialized_proof_generation_key =
            ProofGenerationKey::from_bytes(&serialized_bytes).expect("deserialization successful");

        assert_eq!(
            proof_generation_key.ak,
            deserialized_proof_generation_key.ak
        );
        assert_eq!(
            proof_generation_key.nsk,
            deserialized_proof_generation_key.nsk
        );
    }

    #[test]
    fn test_hex() {
        let mut rng = StdRng::seed_from_u64(0);

        let proof_generation_key = ProofGenerationKey::new(
            ironfish_jubjub::SubgroupPoint::random(&mut rng),
            ironfish_jubjub::Fr::random(&mut rng),
        );

        let hex_key = proof_generation_key.hex_key();

        let deserialized_proof_generation_key =
            ProofGenerationKey::from_hex(&hex_key).expect("deserialization successful");

        assert_eq!(
            proof_generation_key.ak,
            deserialized_proof_generation_key.ak
        );
        assert_eq!(
            proof_generation_key.nsk,
            deserialized_proof_generation_key.nsk
        );
    }
}
