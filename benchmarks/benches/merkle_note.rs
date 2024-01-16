use criterion::{criterion_group, criterion_main, BatchSize, Criterion};
use ironfish::{
    assets::asset_identifier::NATIVE_ASSET, keys::EphemeralKeyPair, MerkleNote, Note, SaplingKey,
    ValueCommitment,
};

pub fn decrypt_note_for_spender(c: &mut Criterion) {
    c.bench_function("merkle_note::decrypt_note_for_spender", |b| {
        b.iter_batched(
            // Setup
            || {
                let spender_key = SaplingKey::generate_key();
                let receiver_key = SaplingKey::generate_key();

                let note = Note::new(
                    receiver_key.public_address(),
                    42,
                    "",
                    NATIVE_ASSET,
                    spender_key.public_address(),
                );

                let ekp = EphemeralKeyPair::new();
                let value_commitment = ValueCommitment::new(note.value(), note.asset_generator());
                let merkle_note = MerkleNote::new(
                    spender_key.outgoing_view_key(),
                    &note,
                    &value_commitment,
                    &ekp,
                );

                return (spender_key.outgoing_view_key().clone(), merkle_note);
            },
            // Benchmark
            |(ovk, merkle_note)| {
                merkle_note.decrypt_note_for_spender(&ovk).unwrap();
            },
            BatchSize::SmallInput,
        );
    });
}

pub fn decrypt_note_for_owner(c: &mut Criterion) {
    c.bench_function("merkle_note::decrypt_note_for_owner", |b| {
        b.iter_batched(
            // Setup
            || {
                let spender_key = SaplingKey::generate_key();
                let receiver_key = SaplingKey::generate_key();

                let note = Note::new(
                    receiver_key.public_address(),
                    42,
                    "",
                    NATIVE_ASSET,
                    spender_key.public_address(),
                );

                let ekp = EphemeralKeyPair::new();
                let value_commitment = ValueCommitment::new(note.value(), note.asset_generator());
                let merkle_note = MerkleNote::new(
                    spender_key.outgoing_view_key(),
                    &note,
                    &value_commitment,
                    &ekp,
                );

                return (receiver_key.incoming_view_key().clone(), merkle_note);
            },
            // Benchmark
            |(ivk, merkle_note)| {
                merkle_note.decrypt_note_for_owner(&ivk).unwrap();
            },
            BatchSize::SmallInput,
        );
    });
}

criterion_group!(benches, decrypt_note_for_spender, decrypt_note_for_owner);
criterion_main!(benches);
