use bellman::{
    gadgets::{
        blake2s,
        boolean::{self, AllocatedBit, Boolean},
    },
    ConstraintSystem, SynthesisError,
};
use ff::PrimeField;
use zcash_proofs::{
    circuit::ecc::{self, EdwardsPoint},
    constants::VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
};

use crate::{
    constants::{ASSET_ID_LENGTH, VALUE_COMMITMENT_GENERATOR_PERSONALIZATION},
    primitives::ValueCommitment,
};

pub fn slice_into_boolean_vec_le<Scalar: PrimeField, CS: ConstraintSystem<Scalar>>(
    mut cs: CS,
    value: Option<&[u8]>,
    byte_length: u32,
) -> Result<Vec<Boolean>, SynthesisError> {
    let bit_length = byte_length * 8;
    let values: Vec<Option<bool>> = match value {
        Some(value) => value
            .iter()
            .flat_map(|&v| (0..8).map(move |i| Some((v >> i) & 1 == 1)))
            .collect(),
        None => vec![None; bit_length as usize],
    };

    let bits = values
        .into_iter()
        .enumerate()
        .map(|(i, b)| {
            Ok(Boolean::from(AllocatedBit::alloc(
                cs.namespace(|| format!("bit {}", i)),
                b,
            )?))
        })
        .collect::<Result<Vec<_>, SynthesisError>>()?;

    if bits.len() != bit_length as usize {
        // Not the best error type here, but easier than forking the error types right now
        return Err(SynthesisError::Unsatisfiable);
    }

    Ok(bits)
}

/// Exposes a Pedersen commitment to the value as an
/// input to the circuit
pub fn expose_value_commitment<CS>(
    mut cs: CS,
    asset_generator: EdwardsPoint,
    value_commitment: Option<ValueCommitment>,
) -> Result<Vec<boolean::Boolean>, SynthesisError>
where
    CS: ConstraintSystem<bls12_381::Scalar>,
{
    // Booleanize the value into little-endian bit order
    let value_bits = boolean::u64_into_boolean_vec_le(
        cs.namespace(|| "value"),
        value_commitment.as_ref().map(|c| c.value),
    )?;

    // Clearing the cofactor and assert_nonzero is essentially the same thing as
    // EdwardsPoint::assert_not_small_order, however, since we need to clear the
    // cofactor anyway, we will also manually check the nonzero u-value

    // Clear the cofactor
    let value_commitment_generator = asset_generator
        .double(cs.namespace(|| "asset_generator first double"))?
        .double(cs.namespace(|| "asset_generator second double"))?
        .double(cs.namespace(|| "asset_generator third double"))?;

    value_commitment_generator
        .get_u()
        .assert_nonzero(cs.namespace(|| "assert asset_generator not small order"))?;

    // Compute the note value in the exponent
    let value = value_commitment_generator.mul(
        cs.namespace(|| "compute the value in the exponent"),
        &value_bits,
    )?;

    // Booleanize the randomness. This does not ensure
    // the bit representation is "in the field" because
    // it doesn't matter for security.
    let rcv = boolean::field_into_boolean_vec_le(
        cs.namespace(|| "rcv"),
        value_commitment.as_ref().map(|c| c.randomness),
    )?;

    // Compute the randomness in the exponent
    let rcv = ecc::fixed_base_multiplication(
        cs.namespace(|| "computation of rcv"),
        &VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
        &rcv,
    )?;

    // Compute the Pedersen commitment to the value
    let cv = value.add(cs.namespace(|| "computation of cv"), &rcv)?;

    // Expose the commitment as an input to the circuit
    cv.inputize(cs.namespace(|| "commitment point"))?;

    Ok(value_bits)
}

pub fn assert_valid_asset_generator<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
    mut cs: CS,
    asset_id: &[u8; ASSET_ID_LENGTH],
    asset_generator_repr: &[Boolean],
) -> Result<(), SynthesisError> {
    // Compute the generator preimage bits
    let asset_generator_preimage = slice_into_boolean_vec_le(
        cs.namespace(|| "booleanize asset id"),
        Some(asset_id),
        ASSET_ID_LENGTH as u32,
    )?;

    // Compute the generator bits
    let asset_generator_bits = blake2s::blake2s(
        cs.namespace(|| "computation of asset generator"),
        &asset_generator_preimage,
        VALUE_COMMITMENT_GENERATOR_PERSONALIZATION,
    )?;

    assert_eq!(asset_generator_bits.len(), 256);
    assert_eq!(asset_generator_repr.len(), 256);

    // Compare the generator bits to the computed generator bits, proving that
    // this is the asset id that derived the generator
    for i in 0..256 {
        boolean::Boolean::enforce_equal(
            cs.namespace(|| format!("asset generator bit {} equality", i)),
            &asset_generator_bits[i],
            &asset_generator_repr[i],
        )?;
    }

    Ok(())
}
