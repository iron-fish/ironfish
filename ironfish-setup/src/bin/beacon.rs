extern crate phase2;
extern crate pairing;
extern crate rand;
extern crate blake2_rfc;
extern crate byteorder;

use std::convert::TryInto;
use std::fs::File;
use std::io::{BufWriter, BufReader};
use blake2_rfc::blake2b::Blake2b;

fn decode_hex(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}

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

    // Create an RNG based on the outcome of the random beacon
    let rng = &mut {
        use byteorder::{ReadBytesExt, BigEndian};
        use rand::{SeedableRng};
        use rand::chacha::ChaChaRng;

        // Place beacon value here (2^42 SHA256 hash of Bitcoin block hash #534861)
        let beacon_value: [u8; 32] = decode_hex("2bf41a959668e5b9b688e58d613b3dcc99ee159a880cf764ec67e6488d8b8af3").as_slice().try_into().unwrap();

        print!("Final result of beacon: ");
        for b in beacon_value.iter() {
            print!("{:02x}", b);
        }
        println!("");

        let mut digest = &beacon_value[..];

        let mut seed = [0u32; 8];
        for i in 0..8 {
            seed[i] = digest.read_u32::<BigEndian>().expect("digest is large enough for this to work");
        }

        ChaChaRng::from_seed(&seed)
    };

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
