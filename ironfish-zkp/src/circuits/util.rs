use std::slice;

use bellman::{
    gadgets::boolean::{self, AllocatedBit, Boolean},
    ConstraintSystem, SynthesisError,
};
use ff::PrimeField;
use zcash_proofs::circuit::ecc::EdwardsPoint;

#[allow(clippy::too_many_arguments)]
pub fn asset_info_preimage<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
    cs: &mut CS,
    name: [u8; 32],
    metadata: [u8; 96],
    asset_public_key: EdwardsPoint,
    nonce: u8,
) -> Result<Vec<boolean::Boolean>, SynthesisError> {
    let mut combined_preimage = vec![];

    combined_preimage
        .extend(asset_public_key.repr(cs.namespace(|| "booleanize asset_public_key"))?);

    let name_bits = slice_into_boolean_vec_le(cs.namespace(|| "booleanize name"), Some(&name), 32)?;
    combined_preimage.extend(name_bits);

    let metadata_bits =
        slice_into_boolean_vec_le(cs.namespace(|| "booleanize metadata"), Some(&metadata), 96)?;
    combined_preimage.extend(metadata_bits);

    let nonce_bits = slice_into_boolean_vec_le(
        cs.namespace(|| "booleanize nonce"),
        Some(slice::from_ref(&nonce)),
        1,
    )?;
    combined_preimage.extend(nonce_bits);

    Ok(combined_preimage)
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
