/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#![warn(clippy::dbg_macro)]
#![warn(clippy::print_stderr)]
#![warn(clippy::print_stdout)]
#![warn(unreachable_pub)]
#![warn(unused_crate_dependencies)]
#![warn(unused_macro_rules)]
#![warn(unused_qualifications)]

#[cfg(feature = "transaction-proofs")]
mod sapling;

pub mod assets;
pub mod errors;
pub mod frost_utils;
pub mod keys;
pub mod merkle_note;
pub mod merkle_note_hash;
pub mod mining;
pub mod nacl;
pub mod note;
pub mod rolling_filter;
pub mod serializing;
pub mod transaction;
pub mod util;
pub mod witness;
pub mod xchacha20poly1305;

#[cfg(any(test, feature = "benchmark"))]
pub mod test_util;

#[cfg(feature = "transaction-proofs")]
pub mod sapling_bls12;

pub use {
    ironfish_frost::frost,
    ironfish_frost::participant,
    keys::{IncomingViewKey, OutgoingViewKey, PublicAddress, SaplingKey, ViewKey},
    merkle_note::MerkleNote,
    merkle_note_hash::MerkleNoteHash,
    note::Note,
    transaction::{outputs::OutputDescription, spends::SpendDescription, Transaction},
};

#[cfg(feature = "benchmark")]
pub use ironfish_zkp::primitives::ValueCommitment;
#[cfg(feature = "transaction-proofs")]
pub use sapling::Sapling;
#[cfg(feature = "transaction-proofs")]
pub use transaction::ProposedTransaction;
