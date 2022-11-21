use crate::constants;

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
