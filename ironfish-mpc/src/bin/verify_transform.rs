extern crate pairing;

use std::fs::File;
use std::io::BufReader;
use blake2::{Blake2b512, Digest};

fn main() {
    let params = File::open("params").unwrap();
    let mut params = BufReader::with_capacity(1024 * 1024, params);

    let new_params = File::open("new_params").unwrap();
    let mut new_params = BufReader::with_capacity(1024 * 1024, new_params);

    let sapling_spend = ironfish_phase2::MPCParameters::read(&mut params, false)
        .expect("couldn't deserialize Sapling Spend params");

    let sapling_output = ironfish_phase2::MPCParameters::read(&mut params, false)
        .expect("couldn't deserialize Sapling Output params");

    let sapling_mint = ironfish_phase2::MPCParameters::read(&mut params, false)
        .expect("couldn't deserialize Sapling Mint params");

    let new_sapling_spend = ironfish_phase2::MPCParameters::read(&mut new_params, true)
        .expect("couldn't deserialize Sapling Spend new_params");

    let new_sapling_output = ironfish_phase2::MPCParameters::read(&mut new_params, true)
        .expect("couldn't deserialize Sapling Output new_params");

    let new_sapling_mint = ironfish_phase2::MPCParameters::read(&mut new_params, true)
        .expect("couldn't deserialize Sapling Mint new_params");

    let h1 = match ironfish_phase2::verify_contribution(&sapling_spend, &new_sapling_spend) {
        Ok(hash) => hash,
        Err(_) => panic!("invalid transformation!")
    };

    let h2 = match ironfish_phase2::verify_contribution(&sapling_output, &new_sapling_output) {
        Ok(hash) => hash,
        Err(_) => panic!("invalid transformation!")
    };

    let h3 = match ironfish_phase2::verify_contribution(&sapling_mint, &new_sapling_mint) {
        Ok(hash) => hash,
        Err(_) => panic!("invalid transformation!")
    };

    let mut h = Blake2b512::new();
    h.update(&h1);
    h.update(&h2);
    h.update(&h3);
    let h = h.finalize();

    println!("{}", into_hex(h.as_ref()));
}

fn into_hex(h: &[u8]) -> String {
    let mut f = String::new();

    for byte in &h[..] {
        f += &format!("{:02x}", byte);
    }

    f
}
