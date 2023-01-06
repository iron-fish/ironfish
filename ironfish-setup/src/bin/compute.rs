extern crate phase2;
extern crate pairing;
extern crate rand;
extern crate blake2_rfc;

use std::fs::File;
use std::io::{BufWriter, BufReader};
use blake2_rfc::blake2b::Blake2b;

fn main() {
    let current_params = File::open("params").expect("couldn't open `./params`");
    let mut current_params = BufReader::with_capacity(1024*1024, current_params);

    let new_params = File::create("new_params").expect("couldn't create `./new_params`");
    let mut new_params = BufWriter::with_capacity(1024*1024, new_params);

    let mut sapling_spend = phase2::MPCParameters::read(&mut current_params, false)
        .expect("couldn't deserialize Sapling Spend params");

    let mut sapling_output = phase2::MPCParameters::read(&mut current_params, false)
        .expect("couldn't deserialize Sapling Output params");

    let mut sprout_joinsplit = phase2::MPCParameters::read(&mut current_params, false)
        .expect("couldn't deserialize Sprout JoinSplit params");

    let rng = &mut rand::OsRng::new().expect("couldn't create RNG");

    let h1 = sapling_spend.contribute(rng);
    let h2 = sapling_output.contribute(rng);
    let h3 = sprout_joinsplit.contribute(rng);

    sapling_spend.write(&mut new_params).expect("couldn't write new Sapling Spend params");
    sapling_output.write(&mut new_params).expect("couldn't write new Sapling Spend params");
    sprout_joinsplit.write(&mut new_params).expect("couldn't write new Sapling Spend params");

    let mut h = Blake2b::new(64);
    h.update(&h1);
    h.update(&h2);
    h.update(&h3);
    let h = h.finalize();

    print!("Done!\n\n\
              Your contribution has been written to `./new_params`\n\n\
              The contribution you made is bound to the following hash:\n");

    for line in h.as_ref().chunks(16) {
        print!("\t");
        for section in line.chunks(4) {
            for b in section {
                print!("{:02x}", b);
            }
            print!(" ");
        }
        println!("");
    }

    println!("\n");
}
