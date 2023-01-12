//! This binary just splits the parameters up into separate files.

extern crate phase2;
extern crate pairing;
extern crate rand;

use std::fs::File;
use std::io::{BufWriter, BufReader};

fn main() {
    let current_params = File::open("params").expect("couldn't open `./params`");
    let mut current_params = BufReader::with_capacity(1024*1024, current_params);

    let sapling_spend = phase2::MPCParameters::read(&mut current_params, false)
        .expect("couldn't deserialize Sapling Spend params");

    let sapling_output = phase2::MPCParameters::read(&mut current_params, false)
        .expect("couldn't deserialize Sapling Output params");

    let sapling_mint = phase2::MPCParameters::read(&mut current_params, false)
        .expect("couldn't deserialize Sapling Mint params");

    {
        let f = File::create("sapling-spend.params").expect("couldn't create `./sapling-spend.params`");
        let mut f = BufWriter::with_capacity(1024*1024, f);
        sapling_spend.write(&mut f)
            .expect("couldn't write new Sapling Spend params");
    }

    {
        let f = File::create("sapling-output.params").expect("couldn't create `./sapling-output.params`");
        let mut f = BufWriter::with_capacity(1024*1024, f);
        sapling_output.write(&mut f)
            .expect("couldn't write new Sapling Output params");
    }

    {
        let f = File::create("sapling-mint.params").expect("couldn't create `./sapling-mint.params`");
        let mut f = BufWriter::with_capacity(1024*1024, f);
        sapling_mint.write(&mut f)
            .expect("couldn't write new Sapling Mint params");
    }
}
