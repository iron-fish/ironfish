//! This binary just splits the parameters up into separate files.

extern crate phase2;
extern crate pairing;
extern crate rand;
extern crate blake2_rfc;

use std::fs::File;
use std::io::{BufWriter, BufReader};

fn main() {
    let current_params = File::open("params").expect("couldn't open `./params`");
    let mut current_params = BufReader::with_capacity(1024*1024, current_params);

    let sapling_spend = phase2::MPCParameters::read(&mut current_params, false)
        .expect("couldn't deserialize Sapling Spend params");

    let sapling_output = phase2::MPCParameters::read(&mut current_params, false)
        .expect("couldn't deserialize Sapling Output params");

    let sprout_joinsplit = phase2::MPCParameters::read(&mut current_params, false)
        .expect("couldn't deserialize Sprout JoinSplit params");

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
        let f = File::create("sprout-groth16.params").expect("couldn't create `./sapling-groth16.params`");
        let mut f = BufWriter::with_capacity(1024*1024, f);
        sprout_joinsplit.write(&mut f)
            .expect("couldn't write new Sprout JoinSplit params");
    }
}
