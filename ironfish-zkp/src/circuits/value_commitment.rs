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
