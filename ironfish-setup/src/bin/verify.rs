extern crate phase2;
extern crate sapling_crypto;
extern crate pairing;
extern crate blake2_rfc;

use std::fs::File;
use std::io::BufReader;
use blake2_rfc::blake2b::Blake2b;

fn main() {
    let jubjub_params = sapling_crypto::jubjub::JubjubBls12::new();

    let params = File::open("params").unwrap();
    let mut params = BufReader::with_capacity(1024 * 1024, params);

    let sapling_spend = phase2::MPCParameters::read(&mut params, true)
        .expect("couldn't deserialize Sapling Spend params");

    let sapling_output = phase2::MPCParameters::read(&mut params, true)
        .expect("couldn't deserialize Sapling Output params");

    let sprout_joinsplit = phase2::MPCParameters::read(&mut params, true)
        .expect("couldn't deserialize Sprout JoinSplit params");

    let sapling_spend_contributions = sapling_spend.verify(sapling_crypto::circuit::sapling::Spend {
        params: &jubjub_params,
        value_commitment: None,
        proof_generation_key: None,
        payment_address: None,
        commitment_randomness: None,
        ar: None,
        auth_path: vec![None; 32], // Tree depth is 32 for sapling
        anchor: None
    }).expect("parameters are invalid");

    let sapling_output_contributions = sapling_output.verify(sapling_crypto::circuit::sapling::Output {
        params: &jubjub_params,
        value_commitment: None,
        payment_address: None,
        commitment_randomness: None,
        esk: None
    }).expect("parameters are invalid");

    let sprout_joinsplit_contributions = sprout_joinsplit.verify(sapling_crypto::circuit::sprout::JoinSplit {
        vpub_old: None,
        vpub_new: None,
        h_sig: None,
        phi: None,
        inputs: vec![sapling_crypto::circuit::sprout::JSInput {
            value: None,
            a_sk: None,
            rho: None,
            r: None,
            auth_path: [None; 29] // Depth is 29 for Sprout
        }, sapling_crypto::circuit::sprout::JSInput {
            value: None,
            a_sk: None,
            rho: None,
            r: None,
            auth_path: [None; 29] // Depth is 29 for Sprout
        }],
        outputs: vec![sapling_crypto::circuit::sprout::JSOutput {
            value: None,
            a_pk: None,
            r: None
        }, sapling_crypto::circuit::sprout::JSOutput {
            value: None,
            a_pk: None,
            r: None
        }],
        rt: None,
    }).expect("parameters are invalid");

    for ((a, b), c) in sapling_spend_contributions.into_iter()
        .zip(sapling_output_contributions.into_iter())
        .zip(sprout_joinsplit_contributions)
    {
        let mut h = Blake2b::new(64);
        h.update(&a);
        h.update(&b);
        h.update(&c);
        let h = h.finalize();

        println!("{}", into_hex(h.as_ref()));
    }
}

fn into_hex(h: &[u8]) -> String {
    let mut f = String::new();

    for byte in &h[..] {
        f += &format!("{:02x}", byte);
    }

    f
}
