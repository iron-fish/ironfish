use bellman::{
    gadgets::{
        blake2s,
        boolean::{self, AllocatedBit, Boolean},
    },
    ConstraintSystem, SynthesisError,
};
use ff::PrimeField;
use zcash_primitives::constants::{GH_FIRST_BLOCK, VALUE_COMMITMENT_GENERATOR_PERSONALIZATION};
use zcash_proofs::{
    circuit::ecc::{self, EdwardsPoint},
    constants::VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
};

use crate::{constants::ASSET_ID_LENGTH, primitives::ValueCommitment};

pub fn asset_id_preimage<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
    mut cs: CS,
    owner_public_key: &EdwardsPoint,
    name: &[u8; 32],
    metadata: &[u8; 77],
    nonce: &u8,
) -> Result<Vec<boolean::Boolean>, SynthesisError> {
    let mut combined_preimage = vec![];

    let gh_first_block_bits = slice_into_boolean_vec_le(
        cs.namespace(|| "booleanize GH_FIRST_BLOCK"),
        Some(GH_FIRST_BLOCK),
        64,
    )?;
    combined_preimage.extend(gh_first_block_bits);

    combined_preimage
        .extend(owner_public_key.repr(cs.namespace(|| "booleanize owner_public_key"))?);

    let name_bits = slice_into_boolean_vec_le(cs.namespace(|| "booleanize name"), Some(name), 32)?;
    combined_preimage.extend(name_bits);

    let metadata_bits =
        slice_into_boolean_vec_le(cs.namespace(|| "booleanize metadata"), Some(metadata), 77)?;
    combined_preimage.extend(metadata_bits);

    let nonce_bits = slice_into_boolean_vec_le(
        cs.namespace(|| "booleanize nonce"),
        Some(std::slice::from_ref(nonce)),
        1,
    )?;
    combined_preimage.extend(nonce_bits);

    Ok(combined_preimage)
}

pub fn assert_valid_asset_generator<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
    mut cs: CS,
    asset_id: &[u8; ASSET_ID_LENGTH],
    asset_generator: &EdwardsPoint,
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

    asset_generator.assert_not_small_order(cs.namespace(|| "asset_generator not small order"))?;

    assert_eq!(asset_generator_bits.len(), 256);
    assert_eq!(asset_generator_repr.len(), 256);

    // We assert that the asset generator for the value commitment is the one
    // calculated from the asset identifier
    for i in 0..256 {
        boolean::Boolean::enforce_equal(
            cs.namespace(|| format!("integrity of asset generator bit {}", i)),
            &asset_generator_bits[i],
            &asset_generator_repr[i],
        )?;
    }

    Ok(())
}

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

    // Compute the note value in the exponent
    let value = asset_generator.mul(
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
