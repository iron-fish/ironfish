use jubjub::SubgroupPoint;
pub use zcash_primitives::constants::{
    CRH_IVK_PERSONALIZATION, PROOF_GENERATION_KEY_GENERATOR, SPENDING_KEY_GENERATOR,
    VALUE_COMMITMENT_GENERATOR_PERSONALIZATION, VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
    VALUE_COMMITMENT_VALUE_GENERATOR,
};

use zcash_primitives::sapling::pedersen_hash;
pub use zcash_proofs::circuit::sapling::TREE_DEPTH;

/// Length in bytes of the asset identifier
pub const ASSET_IDENTIFIER_LENGTH: usize = 32;

// Easier to alias this instead of forking pedersen hash just to extend the Personalization enum
pub const ASSET_IDENTIFIER_PERSONALIZATION: pedersen_hash::Personalization =
    pedersen_hash::Personalization::MerkleTree(62);

pub const ASSET_KEY_GENERATOR: SubgroupPoint = SubgroupPoint::from_raw_unchecked(
    bls12_381::Scalar::from_raw([
        0x01a1_dfbe_fed7_811e,
        0xbff2_d637_174d_935d,
        0x305a_c80e_a582_1a3e,
        0x1632_069d_2401_a801,
    ]),
    bls12_381::Scalar::from_raw([
        0xd9b4_7568_14d2_919a,
        0x5a44_a47e_8a23_af30,
        0x297a_2b87_6a39_7a3e,
        0x5a4c_aa85_44ab_ed28,
    ]),
);

pub const PUBLIC_KEY_GENERATOR: SubgroupPoint = SubgroupPoint::from_raw_unchecked(
    bls12_381::Scalar::from_raw([
        0x3edc_c85f_4d1a_44cd,
        0x77ff_8c90_a9a0_d8f4,
        0x0daf_03b5_47e2_022b,
        0x6dad_65e6_2328_d37a,
    ]),
    bls12_381::Scalar::from_raw([
        0x5095_1f1f_eff0_8278,
        0xf0b7_03d5_3a3e_dd4e,
        0xca01_f580_9c00_eee2,
        0x6996_932c_ece1_f4bb,
    ]),
);

pub mod proof {
    use lazy_static::lazy_static;
    use zcash_proofs::constants::{generate_circuit_generator, FixedGeneratorOwned};

    lazy_static! {
        pub static ref ASSET_KEY_GENERATOR: FixedGeneratorOwned =
            generate_circuit_generator(super::ASSET_KEY_GENERATOR);
    }
}
