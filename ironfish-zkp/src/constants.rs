pub use zcash_primitives::constants::{
    CRH_IVK_PERSONALIZATION, PROOF_GENERATION_KEY_GENERATOR, SPENDING_KEY_GENERATOR,
    VALUE_COMMITMENT_GENERATOR_PERSONALIZATION, VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
    VALUE_COMMITMENT_VALUE_GENERATOR,
};

pub use zcash_proofs::circuit::sapling::TREE_DEPTH;

/// Length in bytes of the asset identifier
pub const ASSET_IDENTIFIER_LENGTH: usize = 32;

/// BLAKE2s personalization for deriving asset identifier from asset name
pub const ASSET_IDENTIFIER_PERSONALIZATION: &[u8; 8] = b"ironf_A_";
