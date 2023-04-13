extern crate pairing;

use std::fs::File;
use std::io::BufWriter;

use ironfish_zkp::constants::ASSET_ID_LENGTH;

fn main() {
    let params = File::create("params").unwrap();
    let mut params = BufWriter::with_capacity(1024 * 1024, params);

    // Sapling spend circuit
    ironfish_phase2::MPCParameters::new(ironfish_zkp::proofs::Spend {
        value_commitment: None,
        proof_generation_key: None,
        payment_address: None,
        commitment_randomness: None,
        ar: None,
        auth_path: vec![None; ironfish_zkp::constants::TREE_DEPTH],
        anchor: None,
        sender_address: None,
    })
    .unwrap()
    .write(&mut params)
    .unwrap();

    // Sapling output circuit
    ironfish_phase2::MPCParameters::new(ironfish_zkp::proofs::Output {
        value_commitment: None,
        payment_address: None,
        commitment_randomness: None,
        esk: None,
        asset_id: [0; ASSET_ID_LENGTH],
        ar: None,
        proof_generation_key: None,
    })
    .unwrap()
    .write(&mut params)
    .unwrap();

    // Sapling mint circuit
    ironfish_phase2::MPCParameters::new(ironfish_zkp::proofs::MintAsset {
        proof_generation_key: None,
        public_key_randomness: None,
    })
    .unwrap()
    .write(&mut params)
    .unwrap();
}
