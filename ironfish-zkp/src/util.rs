use byteorder::{LittleEndian, WriteBytesExt};
use group::GroupEncoding;
use zcash_primitives::{
    constants::NOTE_COMMITMENT_RANDOMNESS_GENERATOR,
    sapling::{
        pedersen_hash::{pedersen_hash, Personalization},
        Note,
    },
};

/// Computes the note commitment, returning the full point.
pub fn commitment_full_point(note: Note) -> jubjub::SubgroupPoint {
    // Calculate the note contents, as bytes
    let mut note_contents = vec![];

    // Writing the value in little endian
    (note_contents)
        .write_u64::<LittleEndian>(note.value)
        .unwrap();

    // Write pk_d
    note_contents.extend_from_slice(&note.pk_d.to_bytes());

    assert_eq!(
        note_contents.len(),
        32 // pk_g
        + 8 // value
    );

    // Compute the Pedersen hash of the note contents
    let hash_of_contents = pedersen_hash(
        Personalization::NoteCommitment,
        note_contents
            .into_iter()
            .flat_map(|byte| (0..8).map(move |i| ((byte >> i) & 1) == 1)),
    );

    // Compute final commitment
    (NOTE_COMMITMENT_RANDOMNESS_GENERATOR * note.rcm()) + hash_of_contents
}
