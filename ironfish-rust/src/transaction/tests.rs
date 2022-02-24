/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#[cfg(test)]
use super::{ProposedTransaction, Transaction};
use crate::{
    keys::SaplingKey,
    merkle_note::NOTE_ENCRYPTION_MINER_KEYS,
    note::{Memo, Note},
    sapling_bls12,
    test_util::make_fake_witness,
};
use pairing::bls12_381::Bls12;

use zcash_primitives::redjubjub::Signature;

#[test]
fn test_transaction() {
    let sapling = sapling_bls12::SAPLING.clone();
    let mut transaction = ProposedTransaction::new(sapling.clone());
    let spender_key: SaplingKey<Bls12> = SaplingKey::generate_key(sapling.clone());
    let receiver_key: SaplingKey<Bls12> = SaplingKey::generate_key(sapling.clone());
    let in_note = Note::new(
        sapling.clone(),
        spender_key.generate_public_address(),
        42,
        Memo([0; 32]),
    );
    let out_note = Note::new(
        sapling.clone(),
        receiver_key.generate_public_address(),
        40,
        Memo([0; 32]),
    );
    let in_note2 = Note::new(
        sapling.clone(),
        spender_key.generate_public_address(),
        18,
        Memo([0; 32]),
    );
    let witness = make_fake_witness(sapling.clone(), &in_note);
    let _witness2 = make_fake_witness(sapling.clone(), &in_note2);
    transaction
        .spend(spender_key.clone(), &in_note, &witness)
        .expect("should be able to prove spend");
    assert_eq!(transaction.spends.len(), 1);
    transaction
        .check_value_consistency()
        .expect("should be consistent after spend");
    transaction
        .receive(&spender_key, &out_note)
        .expect("should be able to prove receipt");
    assert_eq!(transaction.receipts.len(), 1);
    transaction
        .check_value_consistency()
        .expect("should be consistent after receipt");

    // This fails because witness and witness2 have different root hashes, and constructing
    // an auth_path with consistent hashes is non-trivial without a real merkle tree
    // implementation. Multiple spends should be tested at the integration level instead.
    //
    // If you comment the sanity check at the beginning of Transaction.spend, it should pass
    //
    // transaction
    //     .spend(&spender_key, &in_note2, &witness2)
    //     .expect("should be able to prove second spend");

    let public_transaction = transaction
        .post(&spender_key, None, 1)
        .expect("should be able to post transaction");
    public_transaction
        .verify()
        .expect("Should be able to verify transaction");
    assert_eq!(public_transaction.transaction_fee(), 1);

    // A change note was created
    assert_eq!(public_transaction.receipts.len(), 2);

    // test serialization
    let mut serialized_transaction = vec![];
    public_transaction
        .write(&mut serialized_transaction)
        .expect("should be able to serialize transaction");
    let read_back_transaction: Transaction<Bls12> =
        Transaction::read(sapling.clone(), &mut serialized_transaction[..].as_ref())
            .expect("should be able to deserialize valid transaction");
    assert_eq!(
        public_transaction.transaction_fee,
        read_back_transaction.transaction_fee
    );
    assert_eq!(
        public_transaction.spends.len(),
        read_back_transaction.spends.len()
    );
    assert_eq!(
        public_transaction.receipts.len(),
        read_back_transaction.receipts.len()
    );
    let mut serialized_again = vec![];
    read_back_transaction
        .write(&mut serialized_again)
        .expect("should be able to serialize transaction again");
    assert_eq!(serialized_transaction, serialized_again);
}

#[test]
fn test_miners_fee() {
    let sapling = &*sapling_bls12::SAPLING;
    let mut transaction = ProposedTransaction::new(sapling.clone());
    let receiver_key: SaplingKey<Bls12> = SaplingKey::generate_key(sapling.clone());
    let out_note = Note::new(
        sapling.clone(),
        receiver_key.generate_public_address(),
        42,
        Memo([0; 32]),
    );
    transaction
        .receive(&receiver_key, &out_note)
        .expect("It's a valid note");
    let posted_transaction = transaction
        .post_miners_fee()
        .expect("it is a valid miner's fee");
    assert_eq!(posted_transaction.transaction_fee, -42);
    assert_eq!(
        posted_transaction
            .iter_receipts()
            .next()
            .unwrap()
            .merkle_note
            .note_encryption_keys[0..30],
        NOTE_ENCRYPTION_MINER_KEYS[0..30]
    );
}

#[test]
fn test_transaction_signature() {
    let sapling = sapling_bls12::SAPLING.clone();
    let spender_key = SaplingKey::generate_key(sapling.clone());
    let receiver_key = SaplingKey::generate_key(sapling.clone());
    let spender_address = spender_key.generate_public_address();
    let receiver_address = receiver_key.generate_public_address();

    let mut transaction = ProposedTransaction::new(sapling.clone());
    let in_note = Note::new(sapling.clone(), spender_address.clone(), 42, Memo([0; 32]));
    let out_note = Note::new(sapling.clone(), receiver_address.clone(), 41, Memo([0; 32]));
    let witness = make_fake_witness(sapling.clone(), &in_note);

    transaction
        .spend(spender_key.clone(), &in_note, &witness)
        .expect("should be able to spend note");

    transaction
        .receive(&spender_key, &out_note)
        .expect("Should be able to receive note");

    transaction.set_expiration_sequence(1337);

    let public_transaction = transaction
        .post(&spender_key, None, 0)
        .expect("should be able to post transaction");

    let mut serialized_signature = vec![];
    public_transaction
        .binding_signature()
        .write(&mut serialized_signature)
        .unwrap();
    assert_eq!(serialized_signature.len(), 64);
    Signature::read(&mut serialized_signature[..].as_ref())
        .expect("Can deserialize back into a valid Signature");
}
