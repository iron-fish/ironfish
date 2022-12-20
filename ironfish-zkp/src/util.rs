use std::io::Write;

use byteorder::{LittleEndian, WriteBytesExt};
use group::GroupEncoding;
use zcash_primitives::{
    constants::NOTE_COMMITMENT_RANDOMNESS_GENERATOR,
    sapling::pedersen_hash::{pedersen_hash, Personalization},
};

/// Computes the note commitment with sender address, returning the full point.
pub fn commitment_full_point(
    asset_generator: jubjub::SubgroupPoint,
    value: u64,
    pk_d: jubjub::SubgroupPoint,
    rcm: jubjub::Fr,
    sender_address: jubjub::SubgroupPoint,
) -> jubjub::SubgroupPoint {
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
    (NOTE_COMMITMENT_RANDOMNESS_GENERATOR * rcm) + hash_of_contents
}
