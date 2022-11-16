use bellman::{groth16, Circuit};
use bls12_381::Bls12;
use ironfish_zkp::proofs::{Output, Spend};
use rand::thread_rng;

use std::{env, fs::File};

const TREE_DEPTH: usize = 32;

const ALLOWED_ARGUMENTS: [&str; 3] = ["all", "spend", "output"];

fn generate_params(filename: &str, circuit: impl Circuit<bls12_381::Scalar>) {
    let full_filename = format!("{filename}.params");

    let rng = &mut thread_rng();

    println!("Creating params at {full_filename}");
    let groth_params = groth16::generate_random_parameters::<Bls12, _, _>(circuit, rng).unwrap();

    let mut buffer = File::create(full_filename).unwrap();
    groth_params.write(&mut buffer).unwrap();
}

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() != 2 {
        println!(
            "You must provide a circuit choice. Valid choices: {:?}",
            ALLOWED_ARGUMENTS
        );
        return;
    }

    let circuit = &args[1].to_lowercase()[..];

    if !ALLOWED_ARGUMENTS.contains(&circuit) {
        println!(
            "Invalid choice {:?}. Valid choices: {:?}",
            circuit, ALLOWED_ARGUMENTS
        );
        return;
    }

    if circuit == "all" || circuit == "spend" {
        generate_params(
            "sapling-spend",
            Spend {
                value_commitment: None,
                proof_generation_key: None,
                payment_address: None,
                commitment_randomness: None,
                ar: None,
                auth_path: vec![None; TREE_DEPTH],
                anchor: None,
            },
        );
    }

    if circuit == "all" || circuit == "output" {
        generate_params(
            "sapling-output",
            Output {
                value_commitment: None,
                payment_address: None,
                commitment_randomness: None,
                esk: None,
            },
        );
    }
}
