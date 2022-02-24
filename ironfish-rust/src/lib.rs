/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#[macro_use]
extern crate lazy_static;

#[macro_use]
extern crate shrinkwraprs;

use bellman::groth16;
use zcash_primitives::jubjub::{edwards, JubjubEngine};

mod serializing;

pub mod errors;
pub mod keys;
pub mod merkle_note;
pub mod merkle_note_hash;
pub mod mining;
pub mod note;
pub mod nullifiers;
pub mod receiving;
pub mod spending;
pub mod transaction;
pub mod witness;
pub use {
    keys::{IncomingViewKey, OutgoingViewKey, PublicAddress, SaplingKey, ViewKeys},
    merkle_note::MerkleNote,
    merkle_note_hash::MerkleNoteHash,
    note::Note,
    receiving::{ReceiptParams, ReceiptProof},
    spending::{SpendParams, SpendProof},
    transaction::{ProposedTransaction, Transaction},
};
pub mod sapling_bls12;

#[cfg(test)]
pub(crate) mod test_util; // I'm not sure if this is the right way to publish the utility library.

#[cfg(all(feature = "native", feature = "wasm"))]
compile_error!("feature \"native\" and feature \"wasm\" cannot be enabled at the same time");

// The main entry-point to the sapling API. Construct this with loaded parameters, and then call
// methods on it to do the actual work.
//
// spend and output are two arithmetic circuits for use in zksnark calculations provided by Bellman.
// Though the *_params have a verifying key on them, they are not the prepared verifying keys,
// so we store the prepared keys separately at the time of loading the params.
//
// The values are all loaded from a file in serialized form.
pub struct Sapling<J: JubjubEngine + pairing::MultiMillerLoop> {
    spend_params: groth16::Parameters<J>,
    receipt_params: groth16::Parameters<J>,
    spend_verifying_key: groth16::PreparedVerifyingKey<J>,
    receipt_verifying_key: groth16::PreparedVerifyingKey<J>,
    pub jubjub: J::Params, // Initial point on the jubjub curve
}

impl<J: JubjubEngine + pairing::MultiMillerLoop> Sapling<J> {
    /// Initialize a Sapling instance and prepare for proving. Load the parameters from a config file
    /// at a known location (`./sapling_params`, for now).
    ///
    /// The argument `jubjub` is the parameters for a given JubjubEngine. They have to be passed
    /// in instead of being constructed locally because this code is generic across curves, but
    /// zcash_primitives's `J::Params` trait doesn't have a method to construct a default.
    pub fn load(jubjub: J::Params) -> Self {
        // TODO: We'll need to build our own parameters using a trusted set up at some point.
        // These params were borrowed from zcash
        let spend_bytes = include_bytes!("sapling_params/sapling-spend.params");
        let receipt_bytes = include_bytes!("sapling_params/sapling-output.params");

        let spend_params = Sapling::load_params(&spend_bytes[..]);
        let receipt_params = Sapling::load_params(&receipt_bytes[..]);

        let spend_vk = groth16::prepare_verifying_key(&spend_params.vk);
        let receipt_vk = groth16::prepare_verifying_key(&receipt_params.vk);

        Sapling {
            spend_verifying_key: spend_vk,
            receipt_verifying_key: receipt_vk,
            spend_params,
            receipt_params,
            jubjub,
        }
    }

    /// Load sapling parameters from a provided filename. The parameters are huge and take a
    /// couple seconds to load. They primarily contain the "toxic waste" for a specific sapling
    /// curve.
    ///
    /// NOTE: If this is stupidly slow for you, try compiling in --release mode
    fn load_params(bytes: &[u8]) -> groth16::Parameters<J> {
        groth16::Parameters::read(bytes, false).unwrap()
    }
}

// TODO: This belongs in a utility library if we ever need one
fn is_small_order<J: JubjubEngine + pairing::MultiMillerLoop, Order>(
    jubjub: &J::Params,
    point: &edwards::Point<J, Order>,
) -> bool {
    point.double(jubjub).double(jubjub).double(jubjub) == edwards::Point::zero()
}
