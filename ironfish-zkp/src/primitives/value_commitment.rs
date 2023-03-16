use ff::Field;
use group::cofactor::CofactorGroup;
use rand::thread_rng;

use crate::constants::VALUE_COMMITMENT_RANDOMNESS_GENERATOR;

/// This struct is inspired from ZCash's `ValueCommitment` in the Sapling protocol
/// https://github.com/zcash/librustzcash/blob/main/zcash_primitives/src/sapling.rs#L172-L183
#[derive(Clone)]
pub struct ValueCommitment {
    pub value: u64,
    pub randomness: jubjub::Fr,
    pub asset_generator: jubjub::ExtendedPoint,
}

impl ValueCommitment {
    pub fn new(value: u64, asset_generator: jubjub::ExtendedPoint) -> Self {
        Self {
            value,
            randomness: jubjub::Fr::random(thread_rng()),
            asset_generator,
        }
    }

    pub fn commitment(&self) -> jubjub::SubgroupPoint {
        (self.asset_generator.clear_cofactor() * jubjub::Fr::from(self.value))
            + (VALUE_COMMITMENT_RANDOMNESS_GENERATOR * self.randomness)
    }
}

#[cfg(test)]
mod test {
    use ff::Field;
    use group::{Group, GroupEncoding};
    use rand::{rngs::StdRng, thread_rng, SeedableRng};

    use crate::primitives::ValueCommitment;

    #[test]
    fn test_value_commitment() {
        // Seed a fixed rng for determinism in the test
        let mut rng = StdRng::seed_from_u64(0);

        let value_commitment = ValueCommitment {
            value: 5,
            randomness: jubjub::Fr::random(&mut rng),
            asset_generator: jubjub::ExtendedPoint::random(&mut rng),
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

    #[test]
    fn test_value_commitment_new() {
        let generator = jubjub::ExtendedPoint::random(thread_rng());
        let value = 5;

        let value_commitment = ValueCommitment::new(value, generator);

        assert_eq!(value_commitment.value, value);
        assert_eq!(value_commitment.asset_generator, generator);
    }

    #[test]
    fn test_value_commitments_different_assets() {
        // Seed a fixed rng for determinism in the test
        let mut rng = StdRng::seed_from_u64(0);

        let randomness = jubjub::Fr::random(&mut rng);

        let asset_generator_one = jubjub::ExtendedPoint::random(&mut rng);

        let value_commitment_one = ValueCommitment {
            value: 5,
            randomness,
            asset_generator: asset_generator_one,
        };

        let commitment_one = value_commitment_one.commitment();

        let asset_generator_two = jubjub::ExtendedPoint::random(&mut rng);

        let value_commitment_two = ValueCommitment {
            value: 5,
            randomness,
            asset_generator: asset_generator_two,
        };

        let commitment_two = value_commitment_two.commitment();

        assert_ne!(commitment_one.to_bytes(), commitment_two.to_bytes());

        // Sanity check
        assert_ne!(
            asset_generator_one.to_bytes(),
            asset_generator_two.to_bytes()
        );
        assert_eq!(
            value_commitment_one.randomness,
            value_commitment_two.randomness
        );
    }

    #[test]
    fn test_value_commitments_different_randomness() {
        // Seed a fixed rng for determinism in the test
        let mut rng = StdRng::seed_from_u64(0);

        let randomness_one = jubjub::Fr::random(&mut rng);

        let asset_generator = jubjub::ExtendedPoint::random(&mut rng);

        let value_commitment_one = ValueCommitment {
            value: 5,
            randomness: randomness_one,
            asset_generator,
        };

        let commitment_one = value_commitment_one.commitment();

        let randomness_two = jubjub::Fr::random(&mut rng);

        let value_commitment_two = ValueCommitment {
            value: 5,
            randomness: randomness_two,
            asset_generator,
        };

        let commitment_two = value_commitment_two.commitment();

        assert_ne!(commitment_one.to_bytes(), commitment_two.to_bytes());

        // Sanity check
        assert_ne!(randomness_one.to_bytes(), randomness_two.to_bytes());
        assert_eq!(
            value_commitment_one.asset_generator,
            value_commitment_two.asset_generator
        );
    }

    #[test]
    fn test_value_commitments_different_value() {
        // Seed a fixed rng for determinism in the test
        let mut rng = StdRng::seed_from_u64(0);

        let value_one = 5;

        let randomness = jubjub::Fr::random(&mut rng);
        let asset_generator = jubjub::ExtendedPoint::random(&mut rng);

        let value_commitment_one = ValueCommitment {
            value: value_one,
            randomness,
            asset_generator,
        };

        let commitment_one = value_commitment_one.commitment();

        let value_two = 6;

        let value_commitment_two = ValueCommitment {
            value: value_two,
            randomness,
            asset_generator,
        };

        let commitment_two = value_commitment_two.commitment();

        assert_ne!(commitment_one.to_bytes(), commitment_two.to_bytes());

        // Sanity check
        assert_ne!(value_one, value_two);
        assert_eq!(
            value_commitment_one.asset_generator,
            value_commitment_two.asset_generator
        );
        assert_eq!(
            value_commitment_one.randomness,
            value_commitment_two.randomness
        );
    }
}
