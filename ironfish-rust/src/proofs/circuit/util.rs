use std::slice;

use bellman::{
    gadgets::{
        boolean,
        num::{self, Num},
    },
    SynthesisError,
};
use bls12_381::Scalar;
use jubjub::ExtendedPoint;
use zcash_primitives::constants::GH_FIRST_BLOCK;
use zcash_proofs::circuit::ecc::{self, EdwardsPoint};

use super::sapling::slice_into_boolean_vec_le;
use crate::{
    primitives::{asset_type::AssetInfo, sapling::ValueCommitment},
    proofs::circuit::sapling::expose_value_commitment,
    AssetType,
};

pub fn hash_asset_info_to_preimage<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
    cs: &mut CS,
    asset_info: Option<AssetInfo>,
) -> Result<Vec<boolean::Boolean>, SynthesisError> {
    let mut combined_preimage = vec![];

    // TODO: I wonder if we could hard-code this to minimize work?
    // Not clear to me if the booleanizing is adding substantial time
    // or if it's just a by-product of the hash taking longer due to
    // more input. Also not clear if that has security implications
    // by not witnessing the bits
    let first_block_bits = slice_into_boolean_vec_le(
        cs.namespace(|| "booleanize first block"),
        Some(GH_FIRST_BLOCK),
        64 * 8,
    )?;

    assert_eq!(first_block_bits.len(), 64 * 8);

    combined_preimage.extend(first_block_bits);

    let name_bits = slice_into_boolean_vec_le(
        cs.namespace(|| "booleanize name"),
        asset_info.as_ref().and_then(|i| i.name().into()),
        32 * 8,
    )?;

    assert_eq!(name_bits.len(), 32 * 8);

    combined_preimage.extend(name_bits);

    let public_address_bits = slice_into_boolean_vec_le(
        cs.namespace(|| "booleanize public address"),
        asset_info
            .as_ref()
            .and_then(|i| i.public_address_bytes().into()),
        43 * 8,
    )?;

    assert_eq!(public_address_bits.len(), 43 * 8);

    combined_preimage.extend(public_address_bits);

    let nonce_bits = slice_into_boolean_vec_le(
        cs.namespace(|| "booleanize nonce"),
        asset_info
            .as_ref()
            .and_then(|i| slice::from_ref(i.nonce()).into()),
        8,
    )?;

    assert_eq!(nonce_bits.len(), 8);

    combined_preimage.extend(nonce_bits);

    Ok(combined_preimage)
}

pub fn build_note_contents<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
    cs: &mut CS,
    asset_type: Option<AssetType>,
    value_commitment: Option<ValueCommitment>,
    g_d: EdwardsPoint,
    pk_d: EdwardsPoint,
) -> Result<(Vec<boolean::Boolean>, Num<Scalar>), SynthesisError> {
    // Witness the asset type
    // TODO: Does this properly verify that the spend note is the right asset generator?
    // Could this be spoofed, or does this not matter? Need to consider what's public/private
    // In other words: Does this verify that the actual note's asset generator is valid
    // Or are we allowing this to be _any_ generator
    let asset_generator = ecc::EdwardsPoint::witness(
        cs.namespace(|| "asset_generator"),
        asset_type
            .as_ref()
            .and_then(|at| at.asset_generator().into()),
    )?;

    let value_commitment_generator = ecc::EdwardsPoint::witness(
        cs.namespace(|| "value commitment generator"),
        asset_type
            .as_ref()
            .and_then(|at| ExtendedPoint::from(at.value_commitment_generator()).into()),
    )?;

    value_commitment_generator
        .assert_not_small_order(cs.namespace(|| "value_commitment_generator not small order"))?;

    // Compute note contents:
    // asset_generator, value (in big endian), g_d, pk_d
    let mut note_contents = vec![];

    // Place asset_generator in the note
    note_contents
        .extend(asset_generator.repr(cs.namespace(|| "representation of asset_generator"))?);

    // Handle the value; we'll need it later for the
    // dummy input check.
    let mut value_num = num::Num::zero();
    {
        // Get the value in little-endian bit order
        let value_bits = expose_value_commitment(
            cs.namespace(|| "value commitment"),
            value_commitment_generator,
            value_commitment,
        )?;

        // Compute the note's value as a linear combination
        // of the bits.
        let mut coeff = bls12_381::Scalar::one();
        for bit in &value_bits {
            value_num = value_num.add_bool_with_coeff(CS::one(), bit, coeff);
            coeff = coeff.double();
        }

        // Place the value in the note
        note_contents.extend(value_bits);
    }

    // Place g_d in the note
    note_contents.extend(g_d.repr(cs.namespace(|| "representation of g_d"))?);

    // Place pk_d in the note
    note_contents.extend(pk_d.repr(cs.namespace(|| "representation of pk_d"))?);

    assert_eq!(
        note_contents.len(),
        256 + // asset_generator
        64 + // value
        256 + // g_d
        256 // pk_d
    );

    Ok((note_contents, value_num))
}
