use crate::constants;

/// This struct is inspired from ZCash's `ValueCommitment` in the Sapling protocol
/// https://github.com/zcash/librustzcash/blob/main/zcash_primitives/src/sapling.rs#L172-L183
#[derive(Clone)]
pub struct ValueCommitment {
    pub value: u64,

    pub randomness: jubjub::Fr,

    pub asset_generator: jubjub::SubgroupPoint,
}

impl ValueCommitment {
    pub fn commitment(&self) -> jubjub::SubgroupPoint {
        (self.asset_generator * jubjub::Fr::from(self.value))
            + (constants::VALUE_COMMITMENT_RANDOMNESS_GENERATOR * self.randomness)
    }
}

#[cfg(test)]
mod test {
    use ff::Field;
    use group::{Group, GroupEncoding};
    use rand::{rngs::StdRng, SeedableRng};

    use crate::ValueCommitment;

    #[test]
    fn test_value_commitment() {
        // Seed a fixed rng for determinism in the test
        let mut rng = StdRng::seed_from_u64(0);

        let value_commitment = ValueCommitment {
            value: 5,
            randomness: jubjub::Fr::random(&mut rng),
            asset_generator: jubjub::SubgroupPoint::random(&mut rng),
        };

        let commitment = value_commitment.commitment();

        assert_eq!(
            commitment.to_bytes(),
            [
                246, 11, 253, 164, 210, 130, 169, 101, 41, 250, 51, 71, 158, 70, 62, 61, 194, 206,
                21, 161, 234, 105, 158, 75, 142, 162, 25, 155, 101, 231, 117, 38
            ]
        );
    }
}
