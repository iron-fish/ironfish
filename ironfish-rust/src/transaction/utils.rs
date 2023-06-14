/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use bellman::groth16;
use bls12_381::Bls12;

use crate::{errors::IronfishError, sapling_bls12::SAPLING};

/// Helper function for verifying spend proof internally. Note that this is not
/// called by verifiers as part of transaction verification. See
/// [`super::batch_verify_transactions`]
pub(crate) fn verify_spend_proof(
    proof: &groth16::Proof<Bls12>,
    inputs: &[bls12_381::Scalar],
) -> Result<(), IronfishError> {
    groth16::verify_proof(&SAPLING.spend_verifying_key, proof, inputs)?;

    Ok(())
}

/// Helper function for verifying output proof internally. Note that this is not
/// called by verifiers as part of transaction verification. See
/// [`super::batch_verify_transactions`]
pub(crate) fn verify_output_proof(
    proof: &groth16::Proof<Bls12>,
    inputs: &[bls12_381::Scalar],
) -> Result<(), IronfishError> {
    groth16::verify_proof(&SAPLING.output_verifying_key, proof, inputs)?;

    Ok(())
}

/// Helper function for verifying mint proof internally. Note that this is not
/// called by verifiers as part of transaction verification. See
/// [`super::batch_verify_transactions`]
pub(crate) fn verify_mint_proof(
    proof: &groth16::Proof<Bls12>,
    inputs: &[bls12_381::Scalar],
) -> Result<(), IronfishError> {
    groth16::verify_proof(&SAPLING.mint_verifying_key, proof, inputs)?;

    Ok(())
}
