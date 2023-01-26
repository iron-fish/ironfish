extern crate pairing;

use blake2::{Blake2b512, Digest};
use std::fs::File;
use std::io::BufReader;

pub fn verify_transform(
    params_path: &str,
    new_params_path: &str,
) -> Result<String, std::io::Error> {
    let params = File::open(params_path)?;
    let mut params = BufReader::with_capacity(1024 * 1024, params);

    let new_params = File::open(new_params_path)?;
    let mut new_params = BufReader::with_capacity(1024 * 1024, new_params);

    let sapling_spend = ironfish_phase2::MPCParameters::read(&mut params, false)?;

    let sapling_output = ironfish_phase2::MPCParameters::read(&mut params, false)?;

    let sapling_mint = ironfish_phase2::MPCParameters::read(&mut params, false)?;

    let new_sapling_spend = ironfish_phase2::MPCParameters::read(&mut new_params, true)?;

    let new_sapling_output = ironfish_phase2::MPCParameters::read(&mut new_params, true)?;

    let new_sapling_mint = ironfish_phase2::MPCParameters::read(&mut new_params, true)?;

    let h1 = ironfish_phase2::verify_contribution(&sapling_spend, &new_sapling_spend)?;

    let h2 = ironfish_phase2::verify_contribution(&sapling_output, &new_sapling_output)?;

    let h3 = ironfish_phase2::verify_contribution(&sapling_mint, &new_sapling_mint)?;

    let mut h = Blake2b512::new();
    h.update(h1);
    h.update(h2);
    h.update(h3);
    let h = h.finalize();

    Ok(format!("{:02x}", h))
}
