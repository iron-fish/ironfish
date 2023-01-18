extern crate pairing;
extern crate rand;

use std::fs::File;
use std::io::{BufWriter, BufReader};
use blake2::{Blake2b512, Digest};

pub fn compute(input_path: &str, output_path: &str) -> String {
    let current_params = File::open(input_path).expect(&format!("couldn't open `{}`", input_path));
    let mut current_params = BufReader::with_capacity(1024*1024, current_params);

    let new_params = File::create(output_path).expect(&format!("couldn't open `{}`", output_path));
    let mut new_params = BufWriter::with_capacity(1024*1024, new_params);

    let mut sapling_spend = ironfish_phase2::MPCParameters::read(&mut current_params, false)
        .expect("couldn't deserialize Sapling Spend params");

    let mut sapling_output = ironfish_phase2::MPCParameters::read(&mut current_params, false)
        .expect("couldn't deserialize Sapling Output params");

    let mut sapling_mint = ironfish_phase2::MPCParameters::read(&mut current_params, false)
        .expect("couldn't deserialize Sapling Mint params");

    let rng = &mut rand::thread_rng();

    let h1 = sapling_spend.contribute(rng);
    let h2 = sapling_output.contribute(rng);
    let h3 = sapling_mint.contribute(rng);

    sapling_spend.write(&mut new_params).expect("couldn't write new Sapling Spend params");
    sapling_output.write(&mut new_params).expect("couldn't write new Sapling Output params");
    sapling_mint.write(&mut new_params).expect("couldn't write new Sapling Mint params");

    let mut h = Blake2b512::new();
    h.update(&h1);
    h.update(&h2);
    h.update(&h3);
    let h = h.finalize();

    format!("{:02x}", h)
}
