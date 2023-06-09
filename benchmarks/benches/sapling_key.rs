use criterion::{criterion_group, criterion_main, Criterion};
use ironfish::SaplingKey;

pub fn generate_key(c: &mut Criterion) {
    c.bench_function("sapling_key::generate_key", |b| {
        b.iter(|| {
            SaplingKey::generate_key();
        });
    });
}

criterion_group!(benches, generate_key);
criterion_main!(benches);
