/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#[cfg(test)]
use super::{ProposedTransaction, Transaction};
use crate::{
    assets::asset::{Asset, NATIVE_ASSET_GENERATOR},
    keys::SaplingKey,
    merkle_note::NOTE_ENCRYPTION_MINER_KEYS,
    note::Note,
    test_util::make_fake_witness,
    transaction::{TRANSACTION_EXPIRATION_SIZE, TRANSACTION_FEE_SIZE, TRANSACTION_SIGNATURE_SIZE},
};

use ironfish_zkp::redjubjub::Signature;

#[test]
fn test_transaction() {
    let spender_key = SaplingKey::generate_key();
    let receiver_key = SaplingKey::generate_key();
    let sender_key = SaplingKey::generate_key();

    // Native asset
    let in_note = Note::new(
        spender_key.public_address(),
        42,
        "",
        NATIVE_ASSET_GENERATOR,
        sender_key.public_address(),
    );
    let out_note = Note::new(
        receiver_key.public_address(),
        40,
        "",
        NATIVE_ASSET_GENERATOR,
        spender_key.public_address(),
    );

    let witness = make_fake_witness(&in_note);

    // Custom asset
    let mint_value = 5;
    let burn_value = 2;

    let asset = Asset::new(
        spender_key.public_address(),
        "Testcoin",
        "A really cool coin",
    )
    .expect("should be able to create an asset");
    let mint_out_note = Note::new(
        receiver_key.public_address(),
        2,
        "",
        asset.generator(),
        spender_key.public_address(),
    );

    let mut transaction = ProposedTransaction::new(spender_key);

    // Spend
    transaction.add_spend(in_note, &witness).unwrap();
    assert_eq!(transaction.spends.len(), 1);

    // Output
    transaction.add_output(out_note).unwrap();
    assert_eq!(transaction.outputs.len(), 1);

    // Mint 5 tokens
    transaction.add_mint(asset, mint_value).unwrap();
    assert_eq!(transaction.mints.len(), 1);

    // Output 2 minted tokens to receiver
    transaction.add_output(mint_out_note).unwrap();
    assert_eq!(transaction.outputs.len(), 2);

    // Burn 2 tokens, leaving 1 token left to be put into a change note
    transaction.add_burn(asset.id, burn_value).unwrap();
    assert_eq!(transaction.burns.len(), 1);

    let public_transaction = transaction
        .post(None, 1)
        .expect("should be able to post transaction");
    public_transaction
        .verify()
        .expect("Should be able to verify transaction");
    assert_eq!(public_transaction.fee(), 1);

    // 4 outputs:
    // - 1 change note for the native asset
    // - 1 change note for the custom asset
    // - 1 provided output to receiver for native asset
    // - 1 provided output to receiver for minted asset
    assert_eq!(public_transaction.outputs.len(), 4);

    // test serialization
    let mut serialized_transaction = vec![];
    public_transaction
        .write(&mut serialized_transaction)
        .expect("should be able to serialize transaction");

    let read_back_transaction: Transaction =
        Transaction::read(&mut serialized_transaction[..].as_ref())
            .expect("should be able to deserialize valid transaction");

    assert_eq!(
        read_back_transaction.expiration.to_le_bytes().len(),
        TRANSACTION_EXPIRATION_SIZE
    );
    assert_eq!(
        read_back_transaction.fee.to_le_bytes().len(),
        TRANSACTION_FEE_SIZE
    );
    assert_eq!(public_transaction.fee, read_back_transaction.fee);
    assert_eq!(
        public_transaction.spends.len(),
        read_back_transaction.spends.len()
    );
    assert_eq!(
        public_transaction.outputs.len(),
        read_back_transaction.outputs.len()
    );
    assert_eq!(
        public_transaction.mints.len(),
        read_back_transaction.mints.len()
    );
    assert_eq!(
        public_transaction.burns.len(),
        read_back_transaction.burns.len()
    );
    assert_eq!(
        public_transaction.expiration,
        read_back_transaction.expiration
    );
    let mut serialized_again = vec![];
    read_back_transaction
        .write(&mut serialized_again)
        .expect("should be able to serialize transaction again");
    assert_eq!(serialized_transaction, serialized_again);
}

#[test]
fn test_transaction_simple() {
    let spender_key = SaplingKey::generate_key();
    let receiver_key = SaplingKey::generate_key();
    let sender_key = SaplingKey::generate_key();
    let spender_key_clone = spender_key.clone();

    let in_note = Note::new(
        spender_key.public_address(),
        42,
        "",
        NATIVE_ASSET_GENERATOR,
        sender_key.public_address(),
    );
    let out_note = Note::new(
        receiver_key.public_address(),
        40,
        "",
        NATIVE_ASSET_GENERATOR,
        spender_key.public_address(),
    );
    let witness = make_fake_witness(&in_note);

    let mut transaction = ProposedTransaction::new(spender_key);
    transaction.add_spend(in_note, &witness).unwrap();
    assert_eq!(transaction.spends.len(), 1);
    transaction.add_output(out_note).unwrap();
    assert_eq!(transaction.outputs.len(), 1);

    let public_transaction = transaction
        .post(None, 1)
        .expect("should be able to post transaction");
    public_transaction
        .verify()
        .expect("Should be able to verify transaction");
    assert_eq!(public_transaction.fee(), 1);

    // A change note was created
    assert_eq!(public_transaction.outputs.len(), 2);
    assert_eq!(public_transaction.spends.len(), 1);
    assert_eq!(public_transaction.mints.len(), 0);
    assert_eq!(public_transaction.burns.len(), 0);

    let received_note = public_transaction.outputs[1]
        .merkle_note()
        .decrypt_note_for_owner(&spender_key_clone.incoming_viewing_key)
        .unwrap();
    assert_eq!(received_note.sender, spender_key_clone.public_address());
}

#[test]
fn test_miners_fee() {
    let spender_key = SaplingKey::generate_key();
    let receiver_key = SaplingKey::generate_key();
    let out_note = Note::new(
        receiver_key.public_address(),
        42,
        "",
        NATIVE_ASSET_GENERATOR,
        spender_key.public_address(),
    );
    let mut transaction = ProposedTransaction::new(spender_key);
    transaction.add_output(out_note).unwrap();
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
    let spender_address = spender_key.public_address();
    let receiver_address = receiver_key.public_address();
    let sender_key = SaplingKey::generate_key();

    let mut transaction = ProposedTransaction::new(spender_key);
    let in_note = Note::new(
        spender_address,
        42,
        "",
        NATIVE_ASSET_GENERATOR,
        sender_key.public_address(),
    );
    let out_note = Note::new(
        receiver_address,
        41,
        "",
        NATIVE_ASSET_GENERATOR,
        spender_address,
    );
    let witness = make_fake_witness(&in_note);

    transaction.add_spend(in_note, &witness).unwrap();

    transaction.add_output(out_note).unwrap();

    transaction.set_expiration(1337);

    let public_transaction = transaction
        .post(None, 0)
        .expect("should be able to post transaction");

    let mut serialized_signature = vec![];
    public_transaction
        .binding_signature()
        .write(&mut serialized_signature)
        .unwrap();
    assert_eq!(serialized_signature.len(), TRANSACTION_SIGNATURE_SIZE);
    Signature::read(&mut serialized_signature[..].as_ref())
        .expect("Can deserialize back into a valid Signature");
}

#[test]
fn test_transaction_created_with_version_1() {
    let spender_key = SaplingKey::generate_key();
    let receiver_key = SaplingKey::generate_key();
    let sender_key = SaplingKey::generate_key();

    let in_note = Note::new(
        spender_key.public_address(),
        42,
        "",
        NATIVE_ASSET_GENERATOR,
        sender_key.public_address(),
    );

    let out_note = Note::new(
        receiver_key.public_address(),
        40,
        "",
        NATIVE_ASSET_GENERATOR,
        spender_key.public_address(),
    );
    let witness = make_fake_witness(&in_note);

    let mut transaction = ProposedTransaction::new(spender_key);
    transaction.add_spend(in_note, &witness).unwrap();
    transaction.add_output(out_note).unwrap();

    assert_eq!(transaction.version, 1);

    let public_transaction = transaction
        .post(None, 1)
        .expect("should be able to post transaction");

    assert_eq!(public_transaction.version, 1);

    public_transaction
        .verify()
        .expect("version 1 transactions should be valid");
}

#[test]
fn test_transaction_version_is_checked() {
    let spender_key = SaplingKey::generate_key();
    let receiver_key = SaplingKey::generate_key();
    let sender_key = SaplingKey::generate_key();

    let in_note = Note::new(
        spender_key.public_address(),
        42,
        "",
        NATIVE_ASSET_GENERATOR,
        sender_key.public_address(),
    );

    let out_note = Note::new(
        receiver_key.public_address(),
        40,
        "",
        NATIVE_ASSET_GENERATOR,
        spender_key.public_address(),
    );
    let witness = make_fake_witness(&in_note);

    let mut transaction = ProposedTransaction::new(spender_key);
    transaction.add_spend(in_note, &witness).unwrap();
    transaction.add_output(out_note).unwrap();

    transaction.version = 2;

    let public_transaction = transaction
        .post(None, 1)
        .expect("should be able to post transaction");

    public_transaction
        .verify()
        .expect_err("non version 1 transactions should not be valid");
}

#[test]
fn test_transaction_value_overflows() {
    let key = SaplingKey::generate_key();

    let overflow_value = (i64::MAX as u64) + 1;

    let asset = Asset::new(key.public_address(), "testcoin", "").unwrap();

    let note = Note::new(
        key.public_address(),
        overflow_value,
        "",
        NATIVE_ASSET_GENERATOR,
        key.public_address(),
    );
    let witness = make_fake_witness(&note);

    let mut tx = ProposedTransaction::new(key);

    // spend
    assert!(tx.add_spend(note.clone(), &witness).is_err());

    // output
    assert!(tx.add_output(note).is_err());

    // mint
    assert!(tx.add_mint(asset, overflow_value).is_err());

    // burn
    assert!(tx.add_burn(asset.id, overflow_value).is_err());
}
