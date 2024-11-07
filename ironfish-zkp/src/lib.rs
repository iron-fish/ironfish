#![warn(clippy::dbg_macro)]
#![warn(clippy::print_stderr)]
#![warn(clippy::print_stdout)]
#![warn(unreachable_pub)]
#![warn(unused_crate_dependencies)]
#![warn(unused_macro_rules)]
#![warn(unused_qualifications)]

mod circuits;
pub mod constants;
pub mod hex;
pub mod primitives;
pub mod util;

pub use ironfish_primitives::sapling::{
    group_hash::group_hash, pedersen_hash, redjubjub, Diversifier, Note as SaplingNote, Nullifier,
    PaymentAddress, Rseed, ViewingKey,
};

pub use primitives::proof_generation_key::ProofGenerationKey;
pub mod proofs {
    pub use crate::circuits::mint_asset::MintAsset;
    pub use crate::circuits::{output::Output, spend::Spend};
}
