/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use bellman::groth16;
use bls12_381::Bls12;

pub mod assets;
pub mod errors;
pub mod keys;
pub mod merkle_note;
pub mod merkle_note_hash;
pub mod mining;
pub mod nacl;
pub mod note;
pub mod rolling_filter;
pub mod sapling_bls12;
pub mod serializing;
pub mod transaction;
pub mod util;
pub mod witness;
pub use {
    keys::{IncomingViewKey, OutgoingViewKey, PublicAddress, SaplingKey, ViewKey},
    merkle_note::MerkleNote,
    merkle_note_hash::MerkleNoteHash,
    note::Note,
    transaction::{
        outputs::OutputDescription, spends::SpendDescription, ProposedTransaction, Transaction,
        TRANSACTION_VERSION,
    },
};

#[cfg(test)]
pub(crate) mod test_util; // I'm not sure if this is the right way to publish the utility library.

// The main entry-point to the sapling API. Construct this with loaded parameters, and then call
// methods on it to do the actual work.
//
// spend and output are two arithmetic circuits for use in zksnark calculations provided by Bellman.
// Though the *_params have a verifying key on them, they are not the prepared verifying keys,
// so we store the prepared keys separately at the time of loading the params.
//
// The values are all loaded from a file in serialized form.
pub struct Sapling {
    spend_params: groth16::Parameters<Bls12>,
    output_params: groth16::Parameters<Bls12>,
    mint_params: groth16::Parameters<Bls12>,
    spend_verifying_key: groth16::PreparedVerifyingKey<Bls12>,
    output_verifying_key: groth16::PreparedVerifyingKey<Bls12>,
    mint_verifying_key: groth16::PreparedVerifyingKey<Bls12>,
}

impl Sapling {
    /// Initialize a Sapling instance and prepare for proving. Load the parameters from a config file
    /// at a known location (`./sapling_params`, for now).
    pub fn load() -> Self {
        // TODO: We'll need to build our own parameters using a trusted set up at some point.
        // These params were borrowed from zcash
        let spend_bytes = include_bytes!("sapling_params/sapling-spend.params");
        let output_bytes = include_bytes!("sapling_params/sapling-output.params");
        let mint_bytes = include_bytes!("sapling_params/sapling-mint.params");

        let spend_params = Sapling::load_params(&spend_bytes[..]);
        let output_params = Sapling::load_params(&output_bytes[..]);
        let mint_params = Sapling::load_params(&mint_bytes[..]);

        let spend_vk = groth16::prepare_verifying_key(&spend_params.vk);
        let output_vk = groth16::prepare_verifying_key(&output_params.vk);
        let mint_vk = groth16::prepare_verifying_key(&mint_params.vk);

        Sapling {
            spend_verifying_key: spend_vk,
            output_verifying_key: output_vk,
            mint_verifying_key: mint_vk,
            spend_params,
            output_params,
            mint_params,
        }
    }

    /// Load sapling parameters from a provided filename. The parameters are huge and take a
    /// couple seconds to load. They primarily contain the "toxic waste" for a specific sapling
    /// curve.
    ///
    /// NOTE: If this is stupidly slow for you, try compiling in --release mode
    fn load_params(bytes: &[u8]) -> groth16::Parameters<Bls12> {
        groth16::Parameters::read(bytes, false).unwrap()
    }
}
