/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

pub use pairing::bls12_381::{Bls12, Fr};
use std::sync::Arc;

pub type Key = super::SaplingKey<Bls12>;
pub type IncomingViewKey = super::IncomingViewKey<Bls12>;
pub type OutgoingViewKey = super::OutgoingViewKey<Bls12>;

pub type PublicAddress = super::PublicAddress<Bls12>;
pub type ViewKeys = super::ViewKeys<Bls12>;
pub type Address = super::PublicAddress<Bls12>;
pub type Sapling = super::Sapling<Bls12>;
pub type ProposedTransaction = super::ProposedTransaction<Bls12>;
pub type ProposedSpend = super::SpendParams<Bls12>;
pub type Transaction = super::Transaction<Bls12>;
pub type ReceiptProof = super::ReceiptProof<Bls12>;
pub type SpendProof = super::SpendProof<Bls12>;
pub type Note = super::Note<Bls12>;
pub type MerkleNote = super::MerkleNote<Bls12>;
pub type MerkleNoteHash = super::MerkleNoteHash<Bls12>;

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
    Sapling::load(zcash_primitives::jubjub::JubjubBls12::new())
}
