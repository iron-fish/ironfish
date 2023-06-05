use criterion::{black_box, criterion_group, criterion_main, BatchSize, Criterion};
use ironfish::{
    assets::asset::{Asset, METADATA_LENGTH, NAME_LENGTH},
    SaplingKey,
};

pub fn new(c: &mut Criterion) {
    c.bench_function("asset::new", |b| {
        b.iter_batched(
            // Setup
            || {
                let key = SaplingKey::generate_key();
                key.public_address()
            },
            // Benchmark
            |addr| {
                Asset::new(addr, black_box("asset"), black_box("metadata")).unwrap();
            },
            BatchSize::SmallInput,
        );
    });
}

pub fn new_with_nonce(c: &mut Criterion) {
    c.bench_function("asset::new_with_nonce", |b| {
        b.iter_batched(
            // Setup
            || {
                let key = SaplingKey::generate_key();
                key.public_address()
            },
            // Benchmark
            |addr| {
                let _ = Asset::new_with_nonce(
                    addr,
                    black_box([b'a'; NAME_LENGTH]),
                    black_box([b'b'; METADATA_LENGTH]),
                    0,
                );
            },
            BatchSize::SmallInput,
        );
    });
}

criterion_group!(benches, new, new_with_nonce);
criterion_main!(benches);
