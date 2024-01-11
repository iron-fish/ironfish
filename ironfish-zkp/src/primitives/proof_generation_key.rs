use group::GroupEncoding;
use jubjub::{Fr, SubgroupPoint};
use zcash_primitives::sapling::ProofGenerationKey;

pub trait ProofGenerationKeySerializable {
    fn serialize(self) -> [u8; 64];
    fn deserialize(bytes: [u8; 64]) -> Self;
}

impl ProofGenerationKeySerializable for ProofGenerationKey {
    fn serialize(self) -> [u8; 64] {
        let mut proof_generation_key_bytes: [u8; 64] = [0; 64];
        proof_generation_key_bytes[0..32].copy_from_slice(&self.ak.to_bytes());
        proof_generation_key_bytes[32..].copy_from_slice(&self.nsk.to_bytes());
        proof_generation_key_bytes
    }

    fn deserialize(proof_generation_key_bytes: [u8; 64]) -> Self {
        let mut ak_bytes: [u8; 32] = [0; 32];
        let mut nsk_bytes: [u8; 32] = [0; 32];

        ak_bytes[0..32].copy_from_slice(&proof_generation_key_bytes[0..32]);
        nsk_bytes[0..32].copy_from_slice(&proof_generation_key_bytes[32..64]);

        let ak = SubgroupPoint::from_bytes(&ak_bytes).unwrap();
        let nsk = Fr::from_bytes(&nsk_bytes).unwrap();

        ProofGenerationKey { ak, nsk }
    }
}
