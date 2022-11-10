use std::slice;

use bellman::{
    gadgets::boolean::{self, AllocatedBit, Boolean},
    ConstraintSystem, SynthesisError,
};
use ff::PrimeField;
use zcash_primitives::sapling::ValueCommitment;
use zcash_proofs::{
    circuit::ecc::{self, EdwardsPoint},
    constants::{VALUE_COMMITMENT_RANDOMNESS_GENERATOR, VALUE_COMMITMENT_VALUE_GENERATOR},
};

#[allow(clippy::too_many_arguments)]
pub fn asset_info_preimage<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
    cs: &mut CS,
    name: [u8; 32],
    chain: [u8; 32],
    network: [u8; 32],
    token_identifier: [u8; 32],
    g_d: EdwardsPoint,
    pk_d: EdwardsPoint,
    nonce: u8,
) -> Result<Vec<boolean::Boolean>, SynthesisError> {
    let mut combined_preimage = vec![];

    combined_preimage.extend(g_d.repr(cs.namespace(|| "booleanize g_d"))?); // 32
    combined_preimage.extend(pk_d.repr(cs.namespace(|| "booleanize pk_d"))?); // 32

    let name_bits =
        slice_into_boolean_vec_le(cs.namespace(|| "booleanize name"), Some(&name), 32 * 8)?;
    assert_eq!(name_bits.len(), 32 * 8);
    combined_preimage.extend(name_bits); // 32

    let chain_bits =
        slice_into_boolean_vec_le(cs.namespace(|| "booleanize chain"), Some(&chain), 32 * 8)?;
    assert_eq!(chain_bits.len(), 32 * 8);
    combined_preimage.extend(chain_bits); // 32

    let network_bits = slice_into_boolean_vec_le(
        cs.namespace(|| "booleanize network"),
        Some(&network),
        32 * 8,
    )?;
    assert_eq!(network_bits.len(), 32 * 8);
    combined_preimage.extend(network_bits); // 32

    let token_identifier_bits = slice_into_boolean_vec_le(
        cs.namespace(|| "booleanize token_identifier"),
        Some(&token_identifier),
        32 * 8,
    )?;
    assert_eq!(token_identifier_bits.len(), 32 * 8);
    combined_preimage.extend(token_identifier_bits); // 32

    let nonce_bits = slice_into_boolean_vec_le(
        cs.namespace(|| "booleanize nonce"),
        Some(slice::from_ref(&nonce)),
        8,
    )?;
    assert_eq!(nonce_bits.len(), 8);
    combined_preimage.extend(nonce_bits); // 1

    assert_eq!(
        8 * (
            32 + // g_d
            32 +  // pk_d
            32 + // name
            32 + // chain
            32 + // network
            32 + // token identifier
            1
            // nonce
        ),
        combined_preimage.len()
    );

    Ok(combined_preimage)
}

pub fn slice_into_boolean_vec_le<Scalar: PrimeField, CS: ConstraintSystem<Scalar>>(
    mut cs: CS,
    value: Option<&[u8]>,
    length: u32,
) -> Result<Vec<Boolean>, SynthesisError> {
    let values: Vec<Option<bool>> = match value {
        Some(value) => value
            .iter()
            .flat_map(|&v| (0..8).map(move |i| Some((v >> i) & 1 == 1)))
            .collect(),
        None => vec![None; length as usize],
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

    Ok(bits)
}

/// Exposes a Pedersen commitment to the value as an
/// input to the circuit
pub fn expose_value_commitment<CS>(
    mut cs: CS,
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

    // Compute the note value in the exponent
    let value = ecc::fixed_base_multiplication(
        cs.namespace(|| "compute the value in the exponent"),
        &VALUE_COMMITMENT_VALUE_GENERATOR,
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
