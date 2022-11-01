use std::slice;

use bellman::{
    gadgets::boolean::{self, AllocatedBit, Boolean},
    ConstraintSystem, SynthesisError,
};
use ff::PrimeField;

pub fn hash_asset_to_preimage<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
    cs: &mut CS,
    name: [u8; 32],
    chain: [u8; 32],
    network: [u8; 32],
    owner: [u8; 43],
    nonce: u8,
) -> Result<Vec<boolean::Boolean>, SynthesisError> {
    let mut combined_preimage = vec![];

    let owner_bits =
        slice_into_boolean_vec_le(cs.namespace(|| "booleanize owner"), Some(&owner), 43 * 8)?;
    assert_eq!(owner_bits.len(), 43 * 8);
    combined_preimage.extend(owner_bits);

    let name_bits =
        slice_into_boolean_vec_le(cs.namespace(|| "booleanize name"), Some(&name), 32 * 8)?;
    assert_eq!(name_bits.len(), 32 * 8);
    combined_preimage.extend(name_bits);

    let chain_bits =
        slice_into_boolean_vec_le(cs.namespace(|| "booleanize chain"), Some(&chain), 32 * 8)?;
    assert_eq!(chain_bits.len(), 32 * 8);
    combined_preimage.extend(chain_bits);

    let network_bits = slice_into_boolean_vec_le(
        cs.namespace(|| "booleanize network"),
        Some(&network),
        32 * 8,
    )?;
    assert_eq!(network_bits.len(), 32 * 8);
    combined_preimage.extend(network_bits);

    let nonce_bits = slice_into_boolean_vec_le(
        cs.namespace(|| "booleanize nonce"),
        Some(slice::from_ref(&nonce)),
        8,
    )?;
    assert_eq!(nonce_bits.len(), 8);
    combined_preimage.extend(nonce_bits);

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
