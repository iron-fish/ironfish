use jubjub::SubgroupPoint;
pub use zcash_primitives::constants::{
    CRH_IVK_PERSONALIZATION, GH_FIRST_BLOCK, NOTE_COMMITMENT_RANDOMNESS_GENERATOR,
    NULLIFIER_POSITION_GENERATOR, PRF_NF_PERSONALIZATION, PROOF_GENERATION_KEY_GENERATOR,
    SPENDING_KEY_GENERATOR, VALUE_COMMITMENT_GENERATOR_PERSONALIZATION,
    VALUE_COMMITMENT_RANDOMNESS_GENERATOR, VALUE_COMMITMENT_VALUE_GENERATOR,
};

// use zcash_primitives::sapling::pedersen_hash;
pub use zcash_proofs::circuit::sapling::TREE_DEPTH;

/// Length in bytes of the asset identifier
pub const ASSET_ID_LENGTH: usize = 32;

/// BLAKE2s personalization for deriving asset identifier from asset name
pub const ASSET_ID_PERSONALIZATION: &[u8; 8] = b"ironf_A_";

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

pub const NATIVE_VALUE_COMMITMENT_GENERATOR: SubgroupPoint = SubgroupPoint::from_raw_unchecked(
    bls12_381::Scalar::from_raw([
        0x80c7_f5ae_1da3_8af3,
        0x98ba_f7d9_30ae_9fb4,
        0x4013_b536_9827_f490,
        0x6f7d_4197_52cb_de81,
    ]),
    bls12_381::Scalar::from_raw([
        0xf2c7_679e_d68b_3d8e,
        0x1802_9e88_8161_324d,
        0xe533_69d9_0048_0967,
        0x6e93_e7d5_5427_ef9c,
    ]),
);

pub mod proof {
    use lazy_static::lazy_static;
    use zcash_proofs::constants::{generate_circuit_generator, FixedGeneratorOwned};

    lazy_static! {
        pub static ref PUBLIC_KEY_GENERATOR: FixedGeneratorOwned =
            generate_circuit_generator(super::PUBLIC_KEY_GENERATOR);
    }
}
