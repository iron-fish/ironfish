use benchmarks::slow_config;
use criterion::{criterion_group, criterion_main, Criterion};
use ironfish_rust::{
    assets::{asset::Asset, asset_identifier::NATIVE_ASSET},
    test_util::make_fake_witness,
    Note, ProposedTransaction, SaplingKey,
};

pub fn simple(c: &mut Criterion) {
    let key = SaplingKey::generate_key();
    let public_address = key.public_address();

    let spend_note = Note::new(public_address, 42, "", NATIVE_ASSET, public_address);
    let witness = make_fake_witness(&spend_note);

    let out_note = Note::new(public_address, 41, "", NATIVE_ASSET, public_address);

    c.bench_function("transaction::simple", |b| {
        b.iter(|| {
            let mut proposed = ProposedTransaction::new(key.clone());

            proposed.add_spend(spend_note.clone(), &witness).unwrap();
            proposed.add_output(out_note.clone()).unwrap();

            let tx = proposed.post(None, 1).unwrap();

            assert_eq!(tx.spends().len(), 1);
            assert_eq!(tx.outputs().len(), 1);
        })
    });
}

pub fn all_descriptions(c: &mut Criterion) {
    let key = SaplingKey::generate_key();
    let public_address = key.public_address();

    let spend_note = Note::new(public_address, 42, "", NATIVE_ASSET, public_address);
    let witness = make_fake_witness(&spend_note);

    let out_note = Note::new(public_address, 41, "", NATIVE_ASSET, public_address);

    let asset = Asset::new(public_address, "Testcoin", "A really cool coin").unwrap();
    let asset_value = 10;

    c.bench_function("transaction::all_descriptions", |b| {
        b.iter(|| {
            let mut proposed = ProposedTransaction::new(key.clone());

            proposed.add_spend(spend_note.clone(), &witness).unwrap();
            proposed.add_output(out_note.clone()).unwrap();
            proposed.add_mint(asset, asset_value).unwrap();
            proposed.add_burn(*asset.id(), asset_value).unwrap();

            let tx = proposed.post(None, 1).unwrap();

            assert_eq!(tx.spends().len(), 1);
            assert_eq!(tx.outputs().len(), 1);
            assert_eq!(tx.mints().len(), 1);
            assert_eq!(tx.burns().len(), 1);
        })
    });
}

criterion_group! {
    name = slow_benches;
    config = slow_config();
    targets = simple, all_descriptions
}
criterion_main!(slow_benches);
