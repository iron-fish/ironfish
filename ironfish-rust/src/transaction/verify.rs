/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::{IronfishError, IronfishErrorKind},
    sapling_bls12::SAPLING,
    transaction::Transaction,
};
use blstrs::Bls12;
use ironfish_bellperson::groth16::{self, verify_proofs_batch, PreparedVerifyingKey};
use ironfish_jubjub::ExtendedPoint;
use rand::rngs::OsRng;

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

/// A convenience wrapper method around [`batch_verify_transactions`] for single
/// transactions
#[cfg(feature = "transaction-proofs")]
pub fn verify_transaction(transaction: &Transaction) -> Result<(), IronfishError> {
    batch_verify_transactions(std::iter::once(transaction))
}

#[cfg(feature = "transaction-proofs")]
pub(super) fn internal_batch_verify_transactions<'a>(
    transactions: impl IntoIterator<Item = &'a Transaction>,
    spend_verifying_key: &PreparedVerifyingKey<Bls12>,
    output_verifying_key: &PreparedVerifyingKey<Bls12>,
    mint_verifying_key: &PreparedVerifyingKey<Bls12>,
) -> Result<(), IronfishError> {
    let mut spend_proofs = vec![];
    let mut spend_public_inputs = vec![];

    let mut output_proofs = vec![];
    let mut output_public_inputs = vec![];

    let mut mint_proofs = vec![];
    let mut mint_public_inputs = vec![];

    for transaction in transactions {
        // Context to accumulate a signature of all the spends and outputs and
        // guarantee they are part of this transaction, unmodified.
        let mut binding_verification_key = ExtendedPoint::identity();

        let hash_to_verify_signature = transaction.transaction_signature_hash()?;

        for spend in transaction.spends.iter() {
            spend.partial_verify()?;

            spend_proofs.push(&spend.proof);
            spend_public_inputs.push(
                spend
                    .public_inputs(transaction.randomized_public_key())
                    .to_vec(),
            );

            binding_verification_key += spend.value_commitment;

            spend.verify_signature(
                &hash_to_verify_signature,
                transaction.randomized_public_key(),
            )?;
        }

        for output in transaction.outputs.iter() {
            output.partial_verify()?;

            output_proofs.push(&output.proof);
            output_public_inputs.push(
                output
                    .public_inputs(transaction.randomized_public_key())
                    .to_vec(),
            );

            binding_verification_key -= output.merkle_note.value_commitment;
        }

        for mint in transaction.mints.iter() {
            mint.partial_verify()?;

            mint_proofs.push(&mint.proof);
            mint_public_inputs.push(
                mint.public_inputs(transaction.randomized_public_key())
                    .to_vec(),
            );

            mint.verify_signature(
                &hash_to_verify_signature,
                transaction.randomized_public_key(),
            )?;
        }

        transaction.verify_binding_signature(&binding_verification_key)?;
    }

    if !spend_proofs.is_empty()
        && !verify_proofs_batch(
            spend_verifying_key,
            &mut OsRng,
            &spend_proofs[..],
            &spend_public_inputs[..],
        )?
    {
        return Err(IronfishError::new(IronfishErrorKind::InvalidSpendProof));
    }
    if !output_proofs.is_empty()
        && !verify_proofs_batch(
            output_verifying_key,
            &mut OsRng,
            &output_proofs[..],
            &output_public_inputs[..],
        )?
    {
        return Err(IronfishError::new(IronfishErrorKind::InvalidOutputProof));
    }
    if !mint_proofs.is_empty()
        && !verify_proofs_batch(
            mint_verifying_key,
            &mut OsRng,
            &mint_proofs[..],
            &mint_public_inputs[..],
        )?
    {
        return Err(IronfishError::new(IronfishErrorKind::InvalidOutputProof));
    }

    Ok(())
}

/// Validate the transaction. Confirms that:
///  *  Each of the spend proofs has the inputs it says it has
///  *  Each of the output proofs has the inputs it says it has
///  *  Each of the mint proofs has the inputs it says it has
///  *  Each of the spend proofs was signed by the owner
///  *  Each of the mint proofs was signed by the owner
///  *  The entire transaction was signed with a binding signature
///     containing those proofs (and only those proofs)
///
#[cfg(feature = "transaction-proofs")]
pub fn batch_verify_transactions<'a>(
    transactions: impl IntoIterator<Item = &'a Transaction>,
) -> Result<(), IronfishError> {
    internal_batch_verify_transactions(
        transactions,
        &SAPLING.spend_verifying_key,
        &SAPLING.output_verifying_key,
        &SAPLING.mint_verifying_key,
    )
}
