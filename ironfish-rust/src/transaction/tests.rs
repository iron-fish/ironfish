/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use super::{
    batch_verify_transactions, internal_batch_verify_transactions, ProposedTransaction, Transaction,
};
use crate::{
    assets::{asset::Asset, asset_identifier::NATIVE_ASSET},
    errors::IronfishError,
    keys::SaplingKey,
    merkle_note::NOTE_ENCRYPTION_MINER_KEYS,
    note::Note,
    sapling_bls12::SAPLING,
    test_util::make_fake_witness,
    transaction::{
        verify_transaction, TransactionVersion, TRANSACTION_EXPIRATION_SIZE, TRANSACTION_FEE_SIZE,
        TRANSACTION_SIGNATURE_SIZE,
    },
};

use ff::Field;
use group::Group;
use ironfish_zkp::{
    constants::{ASSET_ID_LENGTH, SPENDING_KEY_GENERATOR, TREE_DEPTH},
    proofs::{MintAsset, Output, Spend},
    redjubjub::{self, Signature},
};
use jubjub::ExtendedPoint;
use rand::thread_rng;

#[test]
fn test_transaction() {
    let spender_key = SaplingKey::generate_key();
    let spender_address = spender_key.public_address();
    let receiver_key = SaplingKey::generate_key();
    let sender_key = SaplingKey::generate_key();

    // Native asset
    let in_note = Note::new(
        spender_address,
        42,
        "",
        NATIVE_ASSET,
        sender_key.public_address(),
    );
    let out_note = Note::new(
        receiver_key.public_address(),
        40,
        "",
        NATIVE_ASSET,
        spender_address,
    );

    let witness = make_fake_witness(&in_note);

    // Custom asset
    let mint_value = 5;
    let burn_value = 2;

    let asset = Asset::new(spender_address, "Testcoin", "A really cool coin")
        .expect("should be able to create an asset");

    let mint_out_note = Note::new(
        receiver_key.public_address(),
        2,
        "",
        *asset.id(),
        spender_address,
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
    verify_transaction(&public_transaction, &[spender_address])
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
    let spender_address = spender_key.public_address();
    let spender_incoming_view_key = spender_key.incoming_viewing_key.clone();

    let receiver_key = SaplingKey::generate_key();
    let sender_key = SaplingKey::generate_key();

    let in_note = Note::new(
        spender_address,
        42,
        "",
        NATIVE_ASSET,
        sender_key.public_address(),
    );
    let out_note = Note::new(
        receiver_key.public_address(),
        40,
        "",
        NATIVE_ASSET,
        spender_address,
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
    verify_transaction(&public_transaction, &[spender_address])
        .expect("Should be able to verify transaction");
    assert_eq!(public_transaction.fee(), 1);

    // A change note was created
    assert_eq!(public_transaction.outputs.len(), 2);
    assert_eq!(public_transaction.spends.len(), 1);
    assert_eq!(public_transaction.mints.len(), 0);
    assert_eq!(public_transaction.burns.len(), 0);

    let received_note = public_transaction.outputs[1]
        .merkle_note()
        .decrypt_note_for_owner(&spender_incoming_view_key)
        .unwrap();
    assert_eq!(received_note.sender, spender_address);
}

#[test]
fn test_miners_fee() {
    let spender_key = SaplingKey::generate_key();
    let receiver_key = SaplingKey::generate_key();

    let out_note = Note::new(
        receiver_key.public_address(),
        42,
        "",
        NATIVE_ASSET,
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
    let spender_address = spender_key.public_address();

    let receiver_key = SaplingKey::generate_key();
    let receiver_address = receiver_key.public_address();

    let sender_key = SaplingKey::generate_key();

    let mut transaction = ProposedTransaction::new(spender_key);
    let in_note = Note::new(
        spender_address,
        42,
        "",
        NATIVE_ASSET,
        sender_key.public_address(),
    );
    let out_note = Note::new(receiver_address, 41, "", NATIVE_ASSET, spender_address);
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
    let spender_address = spender_key.public_address();

    let receiver_key = SaplingKey::generate_key();
    let sender_key = SaplingKey::generate_key();

    let in_note = Note::new(
        spender_key.public_address(),
        42,
        "",
        NATIVE_ASSET,
        sender_key.public_address(),
    );

    let out_note = Note::new(
        receiver_key.public_address(),
        40,
        "",
        NATIVE_ASSET,
        spender_key.public_address(),
    );
    let witness = make_fake_witness(&in_note);

    let mut transaction = ProposedTransaction::new(spender_key);
    transaction.add_spend(in_note, &witness).unwrap();
    transaction.add_output(out_note).unwrap();

    assert_eq!(transaction.version, TransactionVersion::V1);

    let public_transaction = transaction
        .post(None, 1)
        .expect("should be able to post transaction");

    assert_eq!(public_transaction.version, TransactionVersion::V1);

    verify_transaction(&public_transaction, &[spender_address])
        .expect("version 1 transactions should be valid");
}

#[test]
fn test_transaction_version_is_checked() {
    fn assert_invalid_version(result: Result<Transaction, IronfishError>) {
        match result {
            Ok(_) => panic!("expected an error"),
            Err(IronfishError::InvalidTransactionVersion) => (),
            Err(ref err) => panic!("expected InvalidTransactionVersion, got {:?} instead", err),
        }
    }

    let mut transaction = [0u8; 256];

    let valid_versions = [1u8, 2u8];
    let invalid_versions = (u8::MIN..=u8::MAX)
        .into_iter()
        .filter(|v| !valid_versions.contains(v))
        .collect::<Vec<u8>>();
    assert_eq!(invalid_versions.len(), 254);

    // Verify that valid versions are correctly deserialized
    for version in valid_versions {
        transaction[0] = version;
        assert!(Transaction::read(&transaction[..]).is_ok());
    }

    // Verify that invalid versions result in InvalidTransactionVersion upon deserialization
    for version in invalid_versions {
        transaction[0] = version;
        assert_invalid_version(Transaction::read(&transaction[..]));
    }
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
        NATIVE_ASSET,
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

#[test]
fn test_batch_verify_wrong_params() {
    let rng = &mut thread_rng();

    let wrong_spend_params =
        bellperson::groth16::generate_random_parameters::<blstrs::Bls12, _, _>(
            Spend {
                value_commitment: None,
                proof_generation_key: None,
                payment_address: None,
                commitment_randomness: None,
                ar: None,
                auth_path: vec![None; TREE_DEPTH],
                anchor: None,
                sender_address: None,
            },
            rng,
        )
        .unwrap();

    let wrong_output_params =
        bellperson::groth16::generate_random_parameters::<blstrs::Bls12, _, _>(
            Output {
                value_commitment: None,
                payment_address: None,
                commitment_randomness: None,
                esk: None,
                asset_id: [0; ASSET_ID_LENGTH],
                ar: None,
                proof_generation_key: None,
            },
            rng,
        )
        .unwrap();

    let wrong_mint_params = bellperson::groth16::generate_random_parameters::<blstrs::Bls12, _, _>(
        MintAsset {
            proof_generation_key: None,
            public_key_randomness: None,
        },
        rng,
    )
    .unwrap();

    let wrong_spend_vk = bellperson::groth16::prepare_verifying_key(&wrong_spend_params.vk);
    let wrong_output_vk = bellperson::groth16::prepare_verifying_key(&wrong_output_params.vk);
    let wrong_mint_vk = bellperson::groth16::prepare_verifying_key(&wrong_mint_params.vk);

    //
    // TRANSACTION GENERATION
    //
    let key = SaplingKey::generate_key();
    let other_key = SaplingKey::generate_key();

    // Native asset
    let in_note = Note::new(
        key.public_address(),
        42,
        "",
        NATIVE_ASSET,
        key.public_address(),
    );
    let out_note = Note::new(
        key.public_address(),
        40,
        "",
        NATIVE_ASSET,
        key.public_address(),
    );

    let witness = make_fake_witness(&in_note);

    // Custom asset
    let mint_value = 5;
    let burn_value = 2;

    let asset1 = Asset::new(key.public_address(), "Testcoin", "A really cool coin")
        .expect("should be able to create an asset");

    let asset2 = Asset::new(other_key.public_address(), "Othercoin", "").unwrap();

    let mint_out_note = Note::new(
        key.public_address(),
        2,
        "",
        *asset1.id(),
        key.public_address(),
    );

    let mut proposed_transaction1 = ProposedTransaction::new(key);

    proposed_transaction1.add_spend(in_note, &witness).unwrap();
    proposed_transaction1.add_output(out_note).unwrap();

    proposed_transaction1.add_mint(asset1, mint_value).unwrap();
    proposed_transaction1.add_output(mint_out_note).unwrap();

    proposed_transaction1
        .add_burn(asset1.id, burn_value)
        .unwrap();

    let transaction1 = proposed_transaction1
        .post(None, 1)
        .expect("should be able to post transaction");

    let mut proposed_transaction2 = ProposedTransaction::new(other_key);
    proposed_transaction2.add_mint(asset2, 5).unwrap();

    let transaction2 = proposed_transaction2.post(None, 0).unwrap();
    //
    // END TRANSACTION CREATION
    //

    batch_verify_transactions(
        [&transaction1, &transaction2],
        &[asset1.creator, asset2.creator],
    )
    .expect("Should verify using Sapling params");
    internal_batch_verify_transactions(
        [&transaction1, &transaction2],
        &[asset1.creator, asset2.creator],
        &wrong_spend_vk,
        &SAPLING.output_verifying_key,
        &SAPLING.mint_verifying_key,
    )
    .expect_err("Should not verify if spend verifying key is wrong");
    internal_batch_verify_transactions(
        [&transaction1, &transaction2],
        &[asset1.creator, asset2.creator],
        &SAPLING.spend_verifying_key,
        &wrong_output_vk,
        &SAPLING.mint_verifying_key,
    )
    .expect_err("Should not verify if output verifying key is wrong");
    internal_batch_verify_transactions(
        [&transaction1, &transaction2],
        &[asset1.creator, asset2.creator],
        &SAPLING.spend_verifying_key,
        &SAPLING.output_verifying_key,
        &wrong_mint_vk,
    )
    .expect_err("Should not verify if mint verifying key is wrong");
}

#[test]
fn test_batch_verify() {
    let key = SaplingKey::generate_key();
    let other_key = SaplingKey::generate_key();

    let public_key_randomness = jubjub::Fr::random(thread_rng());
    let other_randomized_public_key =
        redjubjub::PublicKey(other_key.view_key.authorizing_key.into())
            .randomize(public_key_randomness, *SPENDING_KEY_GENERATOR);

    // Native asset
    let in_note = Note::new(
        key.public_address(),
        42,
        "",
        NATIVE_ASSET,
        key.public_address(),
    );
    let out_note = Note::new(
        key.public_address(),
        40,
        "",
        NATIVE_ASSET,
        key.public_address(),
    );

    let witness = make_fake_witness(&in_note);

    // Custom asset
    let mint_value = 5;
    let burn_value = 2;

    let asset1 = Asset::new(key.public_address(), "Testcoin", "A really cool coin")
        .expect("should be able to create an asset");

    let asset2 = Asset::new(other_key.public_address(), "Othercoin", "").unwrap();

    let mint_out_note = Note::new(
        key.public_address(),
        2,
        "",
        *asset1.id(),
        key.public_address(),
    );

    let mut proposed_transaction1 = ProposedTransaction::new(key);

    proposed_transaction1.add_spend(in_note, &witness).unwrap();
    proposed_transaction1.add_output(out_note).unwrap();

    proposed_transaction1.add_mint(asset1, mint_value).unwrap();
    proposed_transaction1.add_output(mint_out_note).unwrap();

    proposed_transaction1
        .add_burn(asset1.id, burn_value)
        .unwrap();

    let transaction1 = proposed_transaction1
        .post(None, 1)
        .expect("should be able to post transaction");

    let mut proposed_transaction2 = ProposedTransaction::new(other_key);
    proposed_transaction2.add_mint(asset2, 5).unwrap();

    let transaction2 = proposed_transaction2.post(None, 0).unwrap();

    batch_verify_transactions(
        [&transaction1, &transaction2],
        &[asset1.creator, asset2.creator],
    )
    .expect("should be able to verify transaction");

    let mut bad_transaction = transaction1.clone();
    bad_transaction.randomized_public_key = other_randomized_public_key;

    assert!(matches!(
        batch_verify_transactions(
            [&bad_transaction, &transaction2],
            &[asset1.creator, asset1.creator],
        ),
        Err(IronfishError::VerificationFailed)
    ));

    let mut bad_transaction = transaction1.clone();
    bad_transaction.spends[0].value_commitment = ExtendedPoint::random(thread_rng());

    assert!(matches!(
        batch_verify_transactions(
            [&bad_transaction, &transaction2],
            &[asset1.creator, asset2.creator],
        ),
        Err(IronfishError::VerificationFailed)
    ));

    let mut bad_transaction = transaction1.clone();
    bad_transaction.outputs[0].proof = bad_transaction.outputs[1].proof.clone();

    assert!(matches!(
        batch_verify_transactions(
            [&bad_transaction, &transaction2],
            &[asset1.creator, asset2.creator],
        ),
        Err(IronfishError::VerificationFailed)
    ));

    let mut bad_transaction = transaction1;
    bad_transaction.mints[0].value = 999;

    assert!(matches!(
        batch_verify_transactions(
            [&bad_transaction, &transaction2],
            &[asset1.creator, asset2.creator],
        ),
        Err(IronfishError::VerificationFailed)
    ));
}

#[test]
fn test_mint_multiple_owners() {
    // Batch verify 2 transactions:
    // Transaction 1 has 2 mints by the creator
    // Transaction 2 has 1 mint by a new owner

    let creator_key = SaplingKey::generate_key();
    let creator_address = creator_key.public_address();

    let new_owner_key = SaplingKey::generate_key();
    let new_owner_address = new_owner_key.public_address();

    let receiver_key = SaplingKey::generate_key();
    let receiver_address = receiver_key.public_address();

    let asset = Asset::new(creator_address, "Testcoin", "").unwrap();

    let value = 5;

    let mint_out_note1 = Note::new(receiver_address, value, "", *asset.id(), creator_address);
    let mint_out_note2 = Note::new(receiver_address, value, "", *asset.id(), creator_address);
    let mint_out_note3 = Note::new(receiver_address, value, "", *asset.id(), new_owner_address);

    let mut proposed_transaction1 = ProposedTransaction::new(creator_key);

    proposed_transaction1.add_mint(asset, value).unwrap();
    proposed_transaction1.add_mint(asset, value).unwrap();

    proposed_transaction1.add_output(mint_out_note1).unwrap();
    proposed_transaction1.add_output(mint_out_note2).unwrap();

    let mut proposed_transaction2 = ProposedTransaction::new(new_owner_key);

    proposed_transaction2.add_mint(asset, value).unwrap();

    proposed_transaction2.add_output(mint_out_note3).unwrap();

    let transaction1 = proposed_transaction1.post(None, 0).unwrap();
    let transaction2 = proposed_transaction2.post(None, 0).unwrap();

    batch_verify_transactions(
        &[transaction1, transaction2],
        &[creator_address, creator_address, new_owner_address],
    )
    .expect("should be able to batch verify mints with changing owners");
}
