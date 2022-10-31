/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#[cfg(test)]
use super::{ProposedTransaction, Transaction};
use crate::{
    keys::SaplingKey, merkle_note::NOTE_ENCRYPTION_MINER_KEYS, note::Note,
    test_util::make_fake_witness,
};

use ironfish_zkp::redjubjub::Signature;

#[test]
fn test_transaction() {
    let spender_key: SaplingKey = SaplingKey::generate_key();
    let receiver_key: SaplingKey = SaplingKey::generate_key();
    let in_note = Note::new(spender_key.generate_public_address(), 42, "");
    let out_note = Note::new(receiver_key.generate_public_address(), 40, "");
    let in_note2 = Note::new(spender_key.generate_public_address(), 18, "");
    let witness = make_fake_witness(&in_note);
    let _witness2 = make_fake_witness(&in_note2);

    let mut transaction = ProposedTransaction::new(spender_key);
    transaction.add_spend(in_note, &witness);
    assert_eq!(transaction.spends.len(), 1);
    transaction.add_output(out_note);
    assert_eq!(transaction.outputs.len(), 1);

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
        .post(None, 1)
        .expect("should be able to post transaction");
    public_transaction
        .verify()
        .expect("Should be able to verify transaction");
    assert_eq!(public_transaction.fee(), 1);

    // A change note was created
    assert_eq!(public_transaction.outputs.len(), 2);

    // test serialization
    let mut serialized_transaction = vec![];
    public_transaction
        .write(&mut serialized_transaction)
        .expect("should be able to serialize transaction");
    let read_back_transaction: Transaction =
        Transaction::read(&mut serialized_transaction[..].as_ref())
            .expect("should be able to deserialize valid transaction");
    assert_eq!(public_transaction.fee, read_back_transaction.fee);
    assert_eq!(
        public_transaction.spends.len(),
        read_back_transaction.spends.len()
    );
    assert_eq!(
        public_transaction.outputs.len(),
        read_back_transaction.outputs.len()
    );
    let mut serialized_again = vec![];
    read_back_transaction
        .write(&mut serialized_again)
        .expect("should be able to serialize transaction again");
    assert_eq!(serialized_transaction, serialized_again);
}

#[test]
fn test_miners_fee() {
    let receiver_key: SaplingKey = SaplingKey::generate_key();
    let out_note = Note::new(receiver_key.generate_public_address(), 42, "");
    let mut transaction = ProposedTransaction::new(receiver_key);
    transaction.add_output(out_note);
    let posted_transaction = transaction
        .post_miners_fee()
        .expect("it is a valid miner's fee");
    assert_eq!(posted_transaction.fee, -42);
    assert_eq!(
        &posted_transaction
            .iter_outputs()
            .next()
            .unwrap()
            .merkle_note
            .note_encryption_keys,
        NOTE_ENCRYPTION_MINER_KEYS
    );
}

#[test]
fn test_transaction_signature() {
    let spender_key = SaplingKey::generate_key();
    let receiver_key = SaplingKey::generate_key();
    let spender_address = spender_key.generate_public_address();
    let receiver_address = receiver_key.generate_public_address();

    let mut transaction = ProposedTransaction::new(spender_key);
    let in_note = Note::new(spender_address, 42, "");
    let out_note = Note::new(receiver_address, 41, "");
    let witness = make_fake_witness(&in_note);

    transaction.add_spend(in_note, &witness);

    transaction.add_output(out_note);

    transaction.set_expiration_sequence(1337);

    let public_transaction = transaction
        .post(None, 0)
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
