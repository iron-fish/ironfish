use group::GroupEncoding;
use jubjub::{Fr, SubgroupPoint};
use std::io::Error;
use zcash_primitives::sapling::ProofGenerationKey;

pub trait ProofGenerationKeySerializable {
    fn serialize(&self) -> [u8; 64];
    fn deserialize(bytes: [u8; 64]) -> Result<ProofGenerationKey, Error>;
}

impl ProofGenerationKeySerializable for ProofGenerationKey {
    fn serialize(&self) -> [u8; 64] {
        let mut proof_generation_key_bytes: [u8; 64] = [0; 64];
        proof_generation_key_bytes[0..32].copy_from_slice(&self.ak.to_bytes());
        proof_generation_key_bytes[32..].copy_from_slice(&self.nsk.to_bytes());
        proof_generation_key_bytes
    }

    fn deserialize(proof_generation_key_bytes: [u8; 64]) -> Result<Self, Error> {
        let mut ak_bytes: [u8; 32] = [0; 32];
        let mut nsk_bytes: [u8; 32] = [0; 32];

        ak_bytes[0..32].copy_from_slice(&proof_generation_key_bytes[0..32]);
        nsk_bytes[0..32].copy_from_slice(&proof_generation_key_bytes[32..64]);

        let ak = match SubgroupPoint::from_bytes(&ak_bytes).into() {
            Some(ak) => ak,
            None => {
                return Err(Error::new(
                    std::io::ErrorKind::InvalidData,
                    "Invalid proof generation key (ak)",
                ))
            }
        };

        let nsk = match Fr::from_bytes(&nsk_bytes).into() {
            Some(nsk) => nsk,
            None => {
                return Err(Error::new(
                    std::io::ErrorKind::InvalidData,
                    "Invalid proof generation key (nsk)",
                ))
            }
        };

        Ok(ProofGenerationKey { ak, nsk })
    }
}

#[cfg(test)]
mod test {
    use crate::primitives::proof_generation_key::ProofGenerationKeySerializable;
    use ff::Field;
    use group::{Group, GroupEncoding};
    use jubjub;
    use rand::{rngs::StdRng, SeedableRng};
    use zcash_primitives::sapling::ProofGenerationKey; // Import the rand crate for generating random bytes

    #[test]
    fn test_serialize() {
        let mut rng = StdRng::seed_from_u64(0);

        let proof_generation_key = ProofGenerationKey {
            ak: jubjub::SubgroupPoint::random(&mut rng),
            nsk: jubjub::Fr::random(&mut rng),
        };

        let serialized_bytes = proof_generation_key.serialize();

        assert_eq!(serialized_bytes.len(), 64);
    }

    #[test]
    fn test_deserialize_ak_error() {
        let mut proof_generation_key_bytes: [u8; 64] = [0; 64];
        proof_generation_key_bytes[0..32].fill(0xFF);

        let result = ProofGenerationKey::deserialize(proof_generation_key_bytes);

        assert!(result.is_err());

        let err = result.err().unwrap();

        assert_eq!(err.kind(), std::io::ErrorKind::InvalidData);
        assert_eq!(err.to_string(), "Invalid proof generation key (ak)");
    }

    #[test]
    fn test_deserialize_nsk_error() {
        let mut proof_generation_key_bytes: [u8; 64] = [0; 64];
        // Populate with valid bytes for ak and invalid bytes for nsk
        let valid_ak = jubjub::SubgroupPoint::random(&mut StdRng::seed_from_u64(0));
        proof_generation_key_bytes[0..32].copy_from_slice(&valid_ak.to_bytes()); // Assuming these are valid bytes for ak
        proof_generation_key_bytes[32..64].fill(0xFF); // Invalid bytes for nsk

        let result = ProofGenerationKey::deserialize(proof_generation_key_bytes);

        assert!(result.is_err());

        let err = result.err().unwrap();

        assert_eq!(err.kind(), std::io::ErrorKind::InvalidData);

        assert_eq!(err.to_string(), "Invalid proof generation key (nsk)");
    }

    #[test]
    fn test_deserialize() {
        let mut rng = StdRng::seed_from_u64(0);

        let proof_generation_key = ProofGenerationKey {
            ak: jubjub::SubgroupPoint::random(&mut rng),
            nsk: jubjub::Fr::random(&mut rng),
        };

        let serialized_bytes = proof_generation_key.serialize();

        let deserialized_proof_generation_key =
            ProofGenerationKey::deserialize(serialized_bytes).expect("deserialization successful");

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
