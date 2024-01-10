/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use bellperson::groth16;
use blstrs::Bls12;
use group::GroupEncoding;
use ironfish_zkp::ProofGenerationKey;
use jubjub::{SubgroupPoint, Fr};

use crate::{
    errors::{IronfishError, IronfishErrorKind},
    sapling_bls12::SAPLING,
};

/// Helper function for verifying spend proof internally. Note that this is not
/// called by verifiers as part of transaction verification. See
/// [`super::batch_verify_transactions`]
pub(crate) fn verify_spend_proof(
    proof: &groth16::Proof<Bls12>,
    inputs: &[blstrs::Scalar],
) -> Result<(), IronfishError> {
    if !groth16::verify_proof(&SAPLING.spend_verifying_key, proof, inputs)? {
        return Err(IronfishError::new(IronfishErrorKind::InvalidSpendProof));
    }

    Ok(())
}

/// Helper function for verifying output proof internally. Note that this is not
/// called by verifiers as part of transaction verification. See
/// [`super::batch_verify_transactions`]
pub(crate) fn verify_output_proof(
    proof: &groth16::Proof<Bls12>,
    inputs: &[blstrs::Scalar],
) -> Result<(), IronfishError> {
    if !groth16::verify_proof(&SAPLING.output_verifying_key, proof, inputs)? {
        return Err(IronfishError::new(IronfishErrorKind::InvalidOutputProof));
    }

    Ok(())
}

/// Helper function for verifying mint proof internally. Note that this is not
/// called by verifiers as part of transaction verification. See
/// [`super::batch_verify_transactions`]
pub(crate) fn verify_mint_proof(
    proof: &groth16::Proof<Bls12>,
    inputs: &[blstrs::Scalar],
) -> Result<(), IronfishError> {
    if !groth16::verify_proof(&SAPLING.mint_verifying_key, proof, inputs)? {
        return Err(IronfishError::new(IronfishErrorKind::InvalidMintProof));
    }

    Ok(())
}

pub fn proof_generation_key_to_bytes(proof_generation_key: ProofGenerationKey) -> [u8; 64] {
    let mut proof_generation_key_bytes: [u8; 64] = [0; 64];
    proof_generation_key_bytes[0..32].copy_from_slice(&proof_generation_key.ak.to_bytes());
    proof_generation_key_bytes[32..].copy_from_slice(&proof_generation_key.nsk.to_bytes());

    proof_generation_key_bytes
}

pub fn bytes_to_proof_generation_key(proof_generation_key_bytes: [u8; 64]) -> ProofGenerationKey {
    let mut ak_bytes: [u8; 32] = [0; 32];
    let mut nsk_bytes: [u8; 32] = [0; 32];

    ak_bytes[0..32].copy_from_slice(&proof_generation_key_bytes[0..32]);
    nsk_bytes[0..32].copy_from_slice(&proof_generation_key_bytes[32..64]);

    let ak = SubgroupPoint::from_bytes(&ak_bytes).unwrap();
    let nsk = Fr::from_bytes(&nsk_bytes).unwrap();
    ProofGenerationKey { ak, nsk }
}