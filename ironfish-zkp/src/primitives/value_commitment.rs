use byteorder::{LittleEndian, ReadBytesExt};
use ff::Field;
use group::{cofactor::CofactorGroup, GroupEncoding};

use ironfish_jubjub::{ExtendedPoint, Fr};
use rand::thread_rng;

use crate::constants::VALUE_COMMITMENT_RANDOMNESS_GENERATOR;

/// This struct is inspired from ZCash's `ValueCommitment` in the Sapling protocol
/// https://github.com/zcash/librustzcash/blob/main/zcash_primitives/src/sapling.rs#L172-L183
#[derive(Clone, Debug)]
pub struct ValueCommitment {
    pub value: u64,
    pub randomness: Fr,
    pub asset_generator: ExtendedPoint,
}

impl ValueCommitment {
    pub fn new(value: u64, asset_generator: ExtendedPoint) -> Self {
        Self {
            value,
            randomness: Fr::random(thread_rng()),
            asset_generator,
        }
    }

    pub fn commitment(&self) -> ironfish_jubjub::SubgroupPoint {
        (self.asset_generator.clear_cofactor() * Fr::from(self.value))
            + (*VALUE_COMMITMENT_RANDOMNESS_GENERATOR * self.randomness)
    }

    pub fn to_bytes(&self) -> [u8; 72] {
        let mut res = [0u8; 72];
        res[0..8].copy_from_slice(&self.value.to_le_bytes());
        res[8..40].copy_from_slice(&self.randomness.to_bytes());
        res[40..72].copy_from_slice(&self.asset_generator.to_bytes());
        res
    }

    pub fn write<W: std::io::Write>(&self, mut writer: W) -> Result<(), std::io::Error> {
        writer.write_all(&self.to_bytes())?;
        Ok(())
    }

    pub fn read<R: std::io::Read>(mut reader: R) -> Result<Self, std::io::Error> {
        let value = reader.read_u64::<LittleEndian>()?;
        let mut randomness_bytes = [0u8; 32];
        reader.read_exact(&mut randomness_bytes)?;
        let randomness = Fr::from_bytes(&randomness_bytes).unwrap();
        let mut asset_generator = [0u8; 32];
        reader.read_exact(&mut asset_generator)?;
        let asset_generator = ExtendedPoint::from_bytes(&asset_generator).unwrap();
        Ok(Self {
            value,
            randomness,
            asset_generator,
        })
    }
}

#[cfg(test)]
mod test {
    use crate::primitives::ValueCommitment;
    use ff::Field;
    use group::{Group, GroupEncoding};
    use ironfish_jubjub::{ExtendedPoint, Fr};
    use rand::{rngs::StdRng, thread_rng, SeedableRng};

    #[test]
    fn test_value_commitment() {
        // Seed a fixed rng for determinism in the test
        let mut rng = StdRng::seed_from_u64(0);

        let value_commitment = ValueCommitment {
            value: 5,
            randomness: Fr::random(&mut rng),
            asset_generator: ExtendedPoint::random(&mut rng),
        };

        let commitment = value_commitment.commitment();

        assert_eq!(
            commitment.to_bytes(),
            [
                26, 187, 102, 88, 49, 246, 207, 250, 101, 221, 173, 175, 223, 125, 32, 121, 255,
                254, 160, 169, 214, 227, 29, 219, 84, 179, 43, 24, 186, 217, 93, 177
            ],
        );
    }

    #[test]
    fn test_value_commitment_new() {
        let generator = ExtendedPoint::random(thread_rng());
        let value = 5;

        let value_commitment = ValueCommitment::new(value, generator);

        assert_eq!(value_commitment.value, value);
        assert_eq!(value_commitment.asset_generator, generator);
    }

    #[test]
    fn test_value_commitments_different_assets() {
        // Seed a fixed rng for determinism in the test
        let mut rng = StdRng::seed_from_u64(0);

        let randomness = Fr::random(&mut rng);

        let asset_generator_one = ExtendedPoint::random(&mut rng);

        let value_commitment_one = ValueCommitment {
            value: 5,
            randomness,
            asset_generator: asset_generator_one,
        };

        let commitment_one = value_commitment_one.commitment();

        let asset_generator_two = ExtendedPoint::random(&mut rng);

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

        let randomness_one = Fr::random(&mut rng);

        let asset_generator = ExtendedPoint::random(&mut rng);

        let value_commitment_one = ValueCommitment {
            value: 5,
            randomness: randomness_one,
            asset_generator,
        };

        let commitment_one = value_commitment_one.commitment();

        let randomness_two = Fr::random(&mut rng);

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

        let randomness = Fr::random(&mut rng);
        let asset_generator = ExtendedPoint::random(&mut rng);

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

    #[test]
    fn test_value_commitment_read_write() {
        // Seed a fixed rng for determinism in the test
        let mut rng = StdRng::seed_from_u64(0);

        let value_commitment = ValueCommitment {
            value: 5,
            randomness: Fr::random(&mut rng),
            asset_generator: ExtendedPoint::random(&mut rng),
        };

        // Serialize to bytes
        let serialized = value_commitment.to_bytes();

        // Deserialize from bytes
        let deserialized = ValueCommitment::read(&serialized[..]).unwrap();

        // Assert equality
        assert_eq!(value_commitment.value, deserialized.value);
        assert_eq!(value_commitment.randomness, deserialized.randomness);
        assert_eq!(
            value_commitment.asset_generator,
            deserialized.asset_generator
        );
    }
}
