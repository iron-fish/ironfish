use ironfish_jubjub::SubgroupPoint;
pub use ironfish_primitives::constants::{
    CRH_IVK_PERSONALIZATION, GH_FIRST_BLOCK, NOTE_COMMITMENT_RANDOMNESS_GENERATOR,
    NULLIFIER_POSITION_GENERATOR, PROOF_GENERATION_KEY_GENERATOR, SPENDING_KEY_GENERATOR,
    VALUE_COMMITMENT_RANDOMNESS_GENERATOR, VALUE_COMMITMENT_VALUE_GENERATOR,
};
use lazy_static::lazy_static;

pub use ironfish_proofs::circuit::sapling::TREE_DEPTH;

/// Length in bytes of the asset identifier
pub const ASSET_ID_LENGTH: usize = 32;

/// BLAKE2s personalization for deriving asset identifier from asset name
pub const ASSET_ID_PERSONALIZATION: &[u8; 8] = b"ironf_A_";

/// BLAKE2s personalization for PRF^nf = BLAKE2s(nk | rho)
pub const PRF_NF_PERSONALIZATION: &[u8; 8] = b"ironf_nf";

/// BLAKE2s personalization for the value commitment generator for the value
pub const VALUE_COMMITMENT_GENERATOR_PERSONALIZATION: &[u8; 8] = b"ironf_cv";

lazy_static! {
    pub static ref PUBLIC_KEY_GENERATOR: SubgroupPoint = SubgroupPoint::from_raw_unchecked(
        blstrs::Scalar::from_u64s_le(&[
            0x3edc_c85f_4d1a_44cd,
            0x77ff_8c90_a9a0_d8f4,
            0x0daf_03b5_47e2_022b,
            0x6dad_65e6_2328_d37a,
        ])
        .unwrap(),
        blstrs::Scalar::from_u64s_le(&[
            0x5095_1f1f_eff0_8278,
            0xf0b7_03d5_3a3e_dd4e,
            0xca01_f580_9c00_eee2,
            0x6996_932c_ece1_f4bb,
        ])
        .unwrap(),
    );
    pub static ref NATIVE_VALUE_COMMITMENT_GENERATOR: SubgroupPoint =
        SubgroupPoint::from_raw_unchecked(
            blstrs::Scalar::from_u64s_le(&[
                0x94d2_7f25_df35_ab48,
                0xd63c_001a_a39a_7991,
                0x7398_aab3_c907_f5ab,
                0x6623_5382_bd3b_3741,
            ])
            .unwrap(),
            blstrs::Scalar::from_u64s_le(&[
                0x6f79_906c_2a58_8644,
                0x48e2_9b1a_efc3_a67c,
                0x4808_b27f_848e_59b3,
                0x074c_0767_fd99_d42f,
            ])
            .unwrap(),
        );
}

pub mod proof {
    use ironfish_proofs::constants::{generate_circuit_generator, FixedGeneratorOwned};
    use lazy_static::lazy_static;

    lazy_static! {
        pub static ref PUBLIC_KEY_GENERATOR: FixedGeneratorOwned =
            generate_circuit_generator(*super::PUBLIC_KEY_GENERATOR);
    }
}
