extern crate phase2;
extern crate ironfish_zkp;
extern crate pairing;

use std::fs::File;
use std::io::BufWriter;

fn main() {
    let params = File::create("params").unwrap();
    let mut params = BufWriter::with_capacity(1024 * 1024, params);

    // Sapling spend circuit
    phase2::MPCParameters::new(ironfish_zkp::proofs::Spend {
        value_commitment: None,
        proof_generation_key: None,
        payment_address: None,
        commitment_randomness: None,
        ar: None,
        auth_path: vec![None; 32], // Tree depth is 32 for sapling
        anchor: None
    }).unwrap().write(&mut params).unwrap();

    // Sapling output circuit
    phase2::MPCParameters::new(ironfish_zkp::proofs::Output {
        value_commitment: None,
        payment_address: None,
        commitment_randomness: None,
        esk: None
    }).unwrap().write(&mut params).unwrap();

    // Sapling mint circuit
    phase2::MPCParameters::new(ironfish_zkp::proofs::MintAsset {
        name: [0u8; 32],
        metadata: [0u8; 76],
        nonce: 0,
        proof_generation_key: None,
        value_commitment: None,
        public_key_randomness: None,
    }).unwrap().write(&mut params).unwrap();
}
