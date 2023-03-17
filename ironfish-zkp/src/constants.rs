use jubjub::SubgroupPoint;
pub use zcash_primitives::constants::{
    GH_FIRST_BLOCK, NOTE_COMMITMENT_RANDOMNESS_GENERATOR, NULLIFIER_POSITION_GENERATOR,
    PROOF_GENERATION_KEY_GENERATOR, SPENDING_KEY_GENERATOR, VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
    VALUE_COMMITMENT_VALUE_GENERATOR,
};

pub use zcash_proofs::circuit::sapling::TREE_DEPTH;

/// Length in bytes of the asset identifier
pub const ASSET_ID_LENGTH: usize = 32;

/// BLAKE2s personalization for deriving asset identifier from asset name
pub const ASSET_ID_PERSONALIZATION: &[u8; 8] = b"ironf_A_";

/// BLAKE2s personalization for CRH^ivk = BLAKE2s(ak | nk)
pub const CRH_IVK_PERSONALIZATION: &[u8; 8] = b"ironfivk";

/// BLAKE2s personalization for PRF^nf = BLAKE2s(nk | rho)
pub const PRF_NF_PERSONALIZATION: &[u8; 8] = b"ironf_nf";

/// BLAKE2s personalization for the value commitment generator for the value
pub const VALUE_COMMITMENT_GENERATOR_PERSONALIZATION: &[u8; 8] = b"ironf_cv";

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
        0x3582_f1c2_0b34_fc85,
        0x3f9d_e6ad_94cd_eb3f,
        0xc800_efa9_5d82_d6e8,
        0x631b_44c1_f4c5_d29d,
    ]),
    bls12_381::Scalar::from_raw([
        0x55ee_686d_f18b_e7cb,
        0x4b55_93c1_05bb_e917,
        0x01f7_75c6_a5fc_760c,
        0x5c2d_a500_2183_cc87,
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
