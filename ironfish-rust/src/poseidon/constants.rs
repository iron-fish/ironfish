use std::fmt::Debug;

use blstrs::Scalar as Fr;
use generic_array::typenum::{U0, U11, U16, U2, U24, U36, U4, U8};
use lazy_static::lazy_static;
use bellman_neptune::{poseidon::PoseidonConstants, Arity};

pub type PoseidonBinaryArity = U2;
pub type PoseidonQuadArity = U4;
pub type PoseidonOctArity = U8;

/// Arity to use by default for `hash_md` with poseidon.
pub type PoseidonMDArity = U36;

/// Arity to use for hasher implementations (Poseidon) which are specialized at compile time.
/// Must match PoseidonArity
pub const MERKLE_TREE_ARITY: usize = 2;

lazy_static! {
    pub static ref POSEIDON_CONSTANTS_2: PoseidonConstants::<Fr, U2> = PoseidonConstants::new();
    pub static ref POSEIDON_CONSTANTS_4: PoseidonConstants::<Fr, U4> = PoseidonConstants::new();
    pub static ref POSEIDON_CONSTANTS_8: PoseidonConstants::<Fr, U8> = PoseidonConstants::new();
    pub static ref POSEIDON_CONSTANTS_16: PoseidonConstants::<Fr, U16> = PoseidonConstants::new();
    pub static ref POSEIDON_CONSTANTS_24: PoseidonConstants::<Fr, U24> = PoseidonConstants::new();
    pub static ref POSEIDON_CONSTANTS_36: PoseidonConstants::<Fr, U36> = PoseidonConstants::new();
    pub static ref POSEIDON_CONSTANTS_11: PoseidonConstants::<Fr, U11> = PoseidonConstants::new();
    pub static ref POSEIDON_MD_CONSTANTS: PoseidonConstants::<Fr, PoseidonMDArity> =
        PoseidonConstants::new();
}

pub trait PoseidonArity: Arity<Fr> + Send + Sync + Clone + Debug {
    #[allow(non_snake_case)]
    fn PARAMETERS() -> &'static PoseidonConstants<Fr, Self>;
}

impl PoseidonArity for U0 {
    fn PARAMETERS() -> &'static PoseidonConstants<Fr, Self> {
        unreachable!("dummy implementation, do not ever call me")
    }
}

impl PoseidonArity for U2 {
    fn PARAMETERS() -> &'static PoseidonConstants<Fr, Self> {
        &*POSEIDON_CONSTANTS_2
    }
}

impl PoseidonArity for U4 {
    fn PARAMETERS() -> &'static PoseidonConstants<Fr, Self> {
        &*POSEIDON_CONSTANTS_4
    }
}

impl PoseidonArity for U8 {
    fn PARAMETERS() -> &'static PoseidonConstants<Fr, Self> {
        &*POSEIDON_CONSTANTS_8
    }
}

impl PoseidonArity for U11 {
    fn PARAMETERS() -> &'static PoseidonConstants<Fr, Self> {
        &*POSEIDON_CONSTANTS_11
    }
}

impl PoseidonArity for U16 {
    fn PARAMETERS() -> &'static PoseidonConstants<Fr, Self> {
        &*POSEIDON_CONSTANTS_16
    }
}
impl PoseidonArity for U24 {
    fn PARAMETERS() -> &'static PoseidonConstants<Fr, Self> {
        &*POSEIDON_CONSTANTS_24
    }
}
impl PoseidonArity for U36 {
    fn PARAMETERS() -> &'static PoseidonConstants<Fr, Self> {
        &*POSEIDON_CONSTANTS_36
    }
}