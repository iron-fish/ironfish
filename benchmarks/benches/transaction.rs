use benchmarks::{slow_config, very_slow_config};
use criterion::{criterion_group, criterion_main, BatchSize, Criterion};
use ironfish::{
    assets::{asset::Asset, asset_identifier::NATIVE_ASSET},
    test_util::make_fake_witness,
    transaction::{batch_verify_transactions, verify_transaction, TransactionVersion},
    Note, ProposedTransaction, SaplingKey, Transaction,
};

pub fn simple(c: &mut Criterion) {
    c.bench_function("transaction::simple", |b| {
        b.iter_batched(
            // Setup
            || {
                let key = SaplingKey::generate_key();
                let public_address = key.public_address();

                let spend_note = Note::new(public_address, 42, "", NATIVE_ASSET, public_address);
                let witness = make_fake_witness(&spend_note);

                let out_note = Note::new(public_address, 41, "", NATIVE_ASSET, public_address);

                (key, spend_note, witness, out_note)
            },
            // Benchmark
            |(key, spend_note, witness, out_note)| {
                let mut proposed = ProposedTransaction::new(TransactionVersion::latest());

                proposed.add_spend(spend_note, &witness).unwrap();
                proposed.add_output(out_note).unwrap();

                let tx = proposed.post(&key, None, 1).unwrap();

                assert_eq!(tx.spends().len(), 1);
                assert_eq!(tx.outputs().len(), 1);
            },
            BatchSize::LargeInput,
        );
    });
}

pub fn all_descriptions(c: &mut Criterion) {
    c.bench_function("transaction::all_descriptions", |b| {
        b.iter_batched(
            // Setup
            || {
                let key = SaplingKey::generate_key();
                let public_address = key.public_address();

                let spend_note = Note::new(public_address, 42, "", NATIVE_ASSET, public_address);
                let witness = make_fake_witness(&spend_note);

                let out_note = Note::new(public_address, 41, "", NATIVE_ASSET, public_address);

                let asset = Asset::new(public_address, "Testcoin", "A really cool coin").unwrap();

                (key, spend_note, witness, out_note, asset)
            },
            // Benchmark
            |(key, spend_note, witness, out_note, asset)| {
                let asset_value = 10;

                let mut proposed = ProposedTransaction::new(TransactionVersion::latest());

                proposed.add_spend(spend_note, &witness).unwrap();
                proposed.add_output(out_note).unwrap();
                proposed.add_mint(asset, asset_value).unwrap();
                proposed.add_burn(*asset.id(), asset_value).unwrap();

                let tx = proposed.post(&key, None, 1).unwrap();

                assert_eq!(tx.spends().len(), 1);
                assert_eq!(tx.outputs().len(), 1);
                assert_eq!(tx.mints().len(), 1);
                assert_eq!(tx.burns().len(), 1);
            },
            BatchSize::LargeInput,
        );
    });
}

pub fn verify(c: &mut Criterion) {
    c.bench_function("transaction::verify", |b| {
        b.iter_batched(
            // Setup
            || {
                let key = SaplingKey::generate_key();
                let public_address = key.public_address();

                let spend_note = Note::new(public_address, 42, "", NATIVE_ASSET, public_address);
                let witness = make_fake_witness(&spend_note);

                let out_note = Note::new(public_address, 41, "", NATIVE_ASSET, public_address);

                let mut proposed = ProposedTransaction::new(TransactionVersion::latest());

                proposed.add_spend(spend_note, &witness).unwrap();
                proposed.add_output(out_note).unwrap();

                proposed.post(&key, None, 1).unwrap()
            },
            // Benchmark
            |tx| {
                verify_transaction(&tx).unwrap();
            },
            BatchSize::LargeInput,
        );
    });
}

pub fn batch_verify(c: &mut Criterion) {
    c.bench_function("transaction::batch_verify", |b| {
        b.iter_batched(
            // Setup
            || {
                const TRANSACTION_AMOUNT: usize = 5;

                let mut transactions: Vec<Transaction> = Vec::with_capacity(TRANSACTION_AMOUNT);

                for _ in 0..TRANSACTION_AMOUNT {
                    let key = SaplingKey::generate_key();
                    let public_address = key.public_address();

                    let spend_note =
                        Note::new(public_address, 42, "", NATIVE_ASSET, public_address);
                    let witness = make_fake_witness(&spend_note);

                    let out_note = Note::new(public_address, 41, "", NATIVE_ASSET, public_address);

                    let mut proposed = ProposedTransaction::new(TransactionVersion::latest());

                    proposed.add_spend(spend_note, &witness).unwrap();
                    proposed.add_output(out_note).unwrap();

                    transactions.push(proposed.post(&key, None, 1).unwrap());
                }

                transactions
            },
            // Benchmark
            |transactions| {
                batch_verify_transactions(transactions.iter()).unwrap();
            },
            BatchSize::LargeInput,
        );
    });
}

criterion_group! {
    name = slow_benches;
    config = slow_config();
    targets = simple, all_descriptions, verify
}
criterion_group! {
    name = very_slow_benches;
    config = very_slow_config();
    targets = batch_verify,
}
criterion_main!(slow_benches, very_slow_benches);
