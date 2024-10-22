use std::io::Write;

use byteorder::{LittleEndian, WriteBytesExt};
use ff::PrimeField;
use group::{cofactor::CofactorGroup, Group, GroupEncoding};
use ironfish_primitives::{
    constants::NOTE_COMMITMENT_RANDOMNESS_GENERATOR,
    sapling::pedersen_hash::{pedersen_hash, Personalization},
};

use crate::constants::VALUE_COMMITMENT_GENERATOR_PERSONALIZATION;

/// Computes the note commitment with sender address, returning the full point.
pub fn commitment_full_point(
    asset_generator: ironfish_jubjub::ExtendedPoint,
    value: u64,
    pk_d: ironfish_jubjub::SubgroupPoint,
    rcm: ironfish_jubjub::Fr,
    sender_address: ironfish_jubjub::SubgroupPoint,
) -> ironfish_jubjub::SubgroupPoint {
    // Calculate the note contents, as bytes
    let mut note_contents = vec![];

    note_contents
        .write_all(&asset_generator.to_bytes())
        .unwrap();

    // Writing the value in little endian
    (note_contents).write_u64::<LittleEndian>(value).unwrap();

    // Write pk_d
    note_contents.extend_from_slice(&pk_d.to_bytes());

    // Write sender address
    note_contents.extend_from_slice(&sender_address.to_bytes());

    assert_eq!(
        note_contents.len(),
        32 + // asset generator
        8 + // value
        32 + // pk_d
        32 // sender address
    );

    // Compute the Pedersen hash of the note contents
    let hash_of_contents = pedersen_hash(
        Personalization::NoteCommitment,
        note_contents
            .into_iter()
            .flat_map(|byte| (0..8).map(move |i| ((byte >> i) & 1) == 1)),
    );

    // Compute final commitment
    (*NOTE_COMMITMENT_RANDOMNESS_GENERATOR * rcm) + hash_of_contents
}

/// This is a lightly modified group_hash function, for use with the asset identifier/generator flow
#[allow(clippy::assertions_on_constants)]
pub fn asset_hash_to_point(tag: &[u8]) -> Option<ironfish_jubjub::ExtendedPoint> {
    assert_eq!(VALUE_COMMITMENT_GENERATOR_PERSONALIZATION.len(), 8);

    // Check to see that scalar field is 255 bits
    assert!(blstrs::Scalar::NUM_BITS == 255);

    let h = blake2s_simd::Params::new()
        .hash_length(32)
        .personal(VALUE_COMMITMENT_GENERATOR_PERSONALIZATION)
        .to_state()
        .update(tag)
        .finalize();

    let p = ironfish_jubjub::ExtendedPoint::from_bytes(h.as_array());
    if p.is_some().into() {
        let p = p.unwrap();

        // <ExtendedPoint as CofactorGroup>::clear_cofactor is implemented using
        // ExtendedPoint::mul_by_cofactor in the jubjub crate.
        let prime = CofactorGroup::clear_cofactor(&p);

        if prime.is_identity().into() {
            None
        } else {
            // Return the original ExtendedPoint, not the cofactor-cleared one
            Some(p)
        }
    } else {
        None
    }
}
