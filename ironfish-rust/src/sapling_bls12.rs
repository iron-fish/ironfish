/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

pub use bls12_381::{Bls12, Scalar};
use std::sync::Arc;

pub type Key = super::SaplingKey;
pub type IncomingViewKey = super::IncomingViewKey;
pub type OutgoingViewKey = super::OutgoingViewKey;

pub type PublicAddress = super::PublicAddress;
pub type ViewKeys = super::ViewKeys;
pub type Address = super::PublicAddress;
pub type Sapling = super::Sapling;
pub type ProposedTransaction = super::ProposedTransaction;
pub type ProposedSpend = super::SpendParams;
pub type Transaction = super::Transaction;
pub type ReceiptProof = super::ReceiptProof;
pub type SpendProof = super::SpendProof;
pub type Note = super::Note;
pub type MerkleNote = super::MerkleNote;
pub type MerkleNoteHash = super::MerkleNoteHash;

// Loads the Sapling object once when dereferenced,
// then reuses the reference on future calls.
lazy_static! {
    pub static ref SAPLING: Arc<Sapling> = Arc::new(load());
}

/// Load a sapling object configured to a BLS12 jubjub curve. This is currently
/// the only pairing for which a jubjub curve has been defined, and is the
/// default implementation.
///
/// Provided as a convenience method so clients don't have to depend
/// explicitly on zcash_primitives just to define a JubjubBls12 point.
fn load() -> Sapling {
    Sapling::load()
}
