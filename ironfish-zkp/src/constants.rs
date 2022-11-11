use jubjub::SubgroupPoint;
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

pub mod proof {
    use lazy_static::lazy_static;
    use zcash_proofs::constants::{generate_circuit_generator, FixedGeneratorOwned};

    lazy_static! {
        pub static ref ASSET_KEY_GENERATOR: FixedGeneratorOwned =
            generate_circuit_generator(super::ASSET_KEY_GENERATOR);
    }
}
