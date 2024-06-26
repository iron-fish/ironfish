/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::collections::{BTreeMap, HashMap};

use super::internal_batch_verify_transactions;
use super::unsigned::UnsignedTransaction;
use super::{ProposedTransaction, Transaction};
use crate::serializing::{bytes_to_hex, hex_to_vec_bytes};
use crate::test_util::create_multisig_identities;
use crate::transaction::tests::split_spender_key::split_spender_key;
use crate::transaction::TRANSACTION_PUBLIC_KEY_SIZE;
use crate::{
    assets::{asset::Asset, asset_identifier::NATIVE_ASSET},
    errors::{IronfishError, IronfishErrorKind},
    frost_utils::split_spender_key,
    keys::SaplingKey,
    merkle_note::NOTE_ENCRYPTION_MINER_KEYS,
    note::Note,
    sapling_bls12::SAPLING,
    test_util::make_fake_witness,
    transaction::{
        batch_verify_transactions, verify_transaction, TransactionVersion,
        TRANSACTION_EXPIRATION_SIZE, TRANSACTION_FEE_SIZE, TRANSACTION_SIGNATURE_SIZE,
    },
};
#[cfg(test)]
use group::GroupEncoding;

use ff::Field;
use ironfish_frost::{
    frost::{round2, round2::SignatureShare, Identifier, Randomizer},
    nonces::deterministic_signing_nonces,
};
use ironfish_zkp::{
    constants::{ASSET_ID_LENGTH, SPENDING_KEY_GENERATOR, TREE_DEPTH},
    proofs::{MintAsset, Output, Spend},
    redjubjub::{self, Signature},
};
use rand::thread_rng;

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
        *asset.id(),
        spender_key.public_address(),
    );

    let mut transaction = ProposedTransaction::new(TransactionVersion::latest());

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
        .post(&spender_key, None, 1)
        .expect("should be able to post transaction");
    verify_transaction(&public_transaction).expect("Should be able to verify transaction");
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

    let mut transaction = ProposedTransaction::new(TransactionVersion::latest());
    transaction.add_spend(in_note, &witness).unwrap();
    assert_eq!(transaction.spends.len(), 1);
    transaction.add_output(out_note).unwrap();
    assert_eq!(transaction.outputs.len(), 1);

    let public_transaction = transaction
        .post(&spender_key, None, 1)
        .expect("should be able to post transaction");
    verify_transaction(&public_transaction).expect("Should be able to verify transaction");
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
fn test_proposed_transaction_build() {
    let spender_key = SaplingKey::generate_key();
    let receiver_key = SaplingKey::generate_key();
    let sender_key = SaplingKey::generate_key();
    let spender_key_clone = spender_key.clone();

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

    let mut transaction = ProposedTransaction::new(TransactionVersion::latest());
    transaction.add_spend(in_note, &witness).unwrap();
    assert_eq!(transaction.spends.len(), 1);
    transaction.add_output(out_note).unwrap();
    assert_eq!(transaction.outputs.len(), 1);

    let public_address: crate::PublicAddress = spender_key.public_address();
    let intended_fee = 1;

    let unsigned_transaction = transaction
        .build(
            spender_key.proof_authorizing_key,
            spender_key.view_key().clone(),
            spender_key.outgoing_view_key().clone(),
            intended_fee,
            Some(public_address),
        )
        .expect("should be able to build unsigned transaction");

    // A change note was created
    assert_eq!(unsigned_transaction.outputs.len(), 2);
    assert_eq!(unsigned_transaction.spends.len(), 1);
    assert_eq!(unsigned_transaction.mints.len(), 0);
    assert_eq!(unsigned_transaction.burns.len(), 0);

    let received_note = unsigned_transaction.outputs[1]
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
        NATIVE_ASSET,
        spender_key.public_address(),
    );
    let mut transaction = ProposedTransaction::new(TransactionVersion::latest());
    transaction.add_output(out_note).unwrap();
    let posted_transaction = transaction
        .post_miners_fee(&spender_key)
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

    let mut transaction = ProposedTransaction::new(TransactionVersion::latest());
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
        .post(&spender_key, None, 0)
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

    let mut transaction = ProposedTransaction::new(TransactionVersion::V1);
    transaction.add_spend(in_note, &witness).unwrap();
    transaction.add_output(out_note).unwrap();

    assert_eq!(transaction.version, TransactionVersion::V1);

    let public_transaction = transaction
        .post(&spender_key, None, 1)
        .expect("should be able to post transaction");

    assert_eq!(public_transaction.version, TransactionVersion::V1);

    verify_transaction(&public_transaction).expect("version 1 transactions should be valid");
}

#[test]
fn test_transaction_version_is_checked() {
    fn assert_invalid_version(result: Result<Transaction, IronfishError>) {
        match result {
            Ok(_) => panic!("expected an error"),
            Err(IronfishError { kind, .. }) => match kind {
                IronfishErrorKind::InvalidTransactionVersion => {}
                _ => {
                    panic!("expected InvalidTransactionVersion, got {:?} instead", kind);
                }
            },
        }
    }

    let mut transaction = [0u8; 256];

    let valid_versions = [1u8, 2u8];
    let invalid_versions = (u8::MIN..=u8::MAX)
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

    let mut tx = ProposedTransaction::new(TransactionVersion::latest());

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

    let mut proposed_transaction1 = ProposedTransaction::new(TransactionVersion::latest());

    proposed_transaction1.add_spend(in_note, &witness).unwrap();
    proposed_transaction1.add_output(out_note).unwrap();

    proposed_transaction1.add_mint(asset1, mint_value).unwrap();
    proposed_transaction1.add_output(mint_out_note).unwrap();

    proposed_transaction1
        .add_burn(asset1.id, burn_value)
        .unwrap();

    let transaction1 = proposed_transaction1
        .post(&key, None, 1)
        .expect("should be able to post transaction");

    let mut proposed_transaction2 = ProposedTransaction::new(TransactionVersion::latest());
    proposed_transaction2.add_mint(asset2, 5).unwrap();

    let transaction2 = proposed_transaction2.post(&other_key, None, 0).unwrap();
    //
    // END TRANSACTION CREATION
    //

    batch_verify_transactions([&transaction1, &transaction2])
        .expect("Should verify using Sapling params");
    internal_batch_verify_transactions(
        [&transaction1, &transaction2],
        &wrong_spend_vk,
        &SAPLING.output_verifying_key,
        &SAPLING.mint_verifying_key,
    )
    .expect_err("Should not verify if spend verifying key is wrong");
    internal_batch_verify_transactions(
        [&transaction1, &transaction2],
        &SAPLING.spend_verifying_key,
        &wrong_output_vk,
        &SAPLING.mint_verifying_key,
    )
    .expect_err("Should not verify if output verifying key is wrong");
    internal_batch_verify_transactions(
        [&transaction1, &transaction2],
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

    let mut proposed_transaction1 = ProposedTransaction::new(TransactionVersion::latest());

    proposed_transaction1.add_spend(in_note, &witness).unwrap();
    proposed_transaction1.add_output(out_note).unwrap();

    proposed_transaction1.add_mint(asset1, mint_value).unwrap();
    proposed_transaction1.add_output(mint_out_note).unwrap();

    proposed_transaction1
        .add_burn(asset1.id, burn_value)
        .unwrap();

    let mut transaction1 = proposed_transaction1
        .post(&key, None, 1)
        .expect("should be able to post transaction");

    let mut proposed_transaction2 = ProposedTransaction::new(TransactionVersion::latest());
    proposed_transaction2.add_mint(asset2, 5).unwrap();

    let transaction2 = proposed_transaction2.post(&other_key, None, 0).unwrap();

    batch_verify_transactions([&transaction1, &transaction2])
        .expect("should be able to verify transaction");

    transaction1.randomized_public_key = other_randomized_public_key;

    assert!(matches!(
        batch_verify_transactions([&transaction1, &transaction2]),
        Err(e) if matches!(e.kind, IronfishErrorKind::InvalidSpendSignature)
    ));
}

#[test]
fn test_sign_simple() {
    let spender_key = SaplingKey::generate_key();
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

    // create transaction, add spend and output
    let mut transaction = ProposedTransaction::new(TransactionVersion::latest());
    transaction
        .add_spend(in_note, &witness)
        .expect("should be able to add a spend");
    transaction
        .add_output(out_note)
        .expect("should be able to add an output");

    // build transaction, generate proofs
    let unsigned_transaction = transaction
        .build(
            spender_key.proof_authorizing_key,
            spender_key.view_key().clone(),
            spender_key.outgoing_view_key().clone(),
            1,
            Some(spender_key.public_address()),
        )
        .expect("should be able to build unsigned transaction");

    // sign transaction
    let signed_transaction = unsigned_transaction
        .sign(&spender_key)
        .expect("should be able to sign transaction");

    // verify transaction
    verify_transaction(&signed_transaction).expect("should be able to verify transaction");
}

#[test]
fn test_aggregate_signature_shares() {
    let spender_key = SaplingKey::generate_key();

    let identities = create_multisig_identities(10);

    // key package generation by trusted dealer
    let key_packages = split_spender_key(&spender_key, 2, &identities)
        .expect("should be able to split spender key");

    // create raw/proposed transaction
    let in_note = Note::new(
        key_packages.public_address,
        42,
        "",
        NATIVE_ASSET,
        key_packages.public_address,
    );
    let out_note = Note::new(
        key_packages.public_address,
        40,
        "",
        NATIVE_ASSET,
        key_packages.public_address,
    );
    let asset = Asset::new(
        key_packages.public_address,
        "Testcoin",
        "A really cool coin",
    )
    .expect("should be able to create an asset");
    let value = 5;
    let mint_out_note = Note::new(
        key_packages.public_address,
        value,
        "",
        *asset.id(),
        key_packages.public_address,
    );
    let witness = make_fake_witness(&in_note);

    let mut transaction = ProposedTransaction::new(TransactionVersion::latest());
    transaction
        .add_spend(in_note, &witness)
        .expect("add spend to transaction");
    assert_eq!(transaction.spends.len(), 1);
    transaction
        .add_output(out_note)
        .expect("add output to transaction");
    assert_eq!(transaction.outputs.len(), 1);
    transaction
        .add_mint(asset, value)
        .expect("add mint to transaction");
    transaction
        .add_output(mint_out_note)
        .expect("add mint output to transaction");

    let intended_fee = 1;
    transaction
        .add_change_notes(
            Some(key_packages.public_address),
            key_packages.public_address,
            intended_fee,
        )
        .expect("should be able to add change notes");

    // build UnsignedTransaction without signing
    let mut unsigned_transaction = transaction
        .build(
            key_packages.proof_authorizing_key,
            key_packages.view_key,
            key_packages.outgoing_view_key,
            intended_fee,
            Some(key_packages.public_address),
        )
        .expect("should be able to build unsigned transaction");

    let transaction_hash = unsigned_transaction
        .transaction_signature_hash()
        .expect("should be able to compute transaction hash");

    let mut commitments = HashMap::new();

    // simulate round 1
    for (identity, key_package) in key_packages.key_packages.iter() {
        let nonces = deterministic_signing_nonces(
            key_package.signing_share(),
            &transaction_hash,
            &identities,
        );
        commitments.insert(identity.clone(), (&nonces).into());
    }

    // coordinator creates signing package
    let signing_package = unsigned_transaction
        .signing_package(commitments)
        .expect("should be able to create signing package");

    // simulate round 2
    let mut signature_shares: BTreeMap<Identifier, SignatureShare> = BTreeMap::new();
    let randomizer =
        Randomizer::deserialize(&unsigned_transaction.public_key_randomness.to_bytes())
            .expect("should be able to deserialize randomizer");

    for (identity, key_package) in key_packages.key_packages.iter() {
        let nonces = deterministic_signing_nonces(
            key_package.signing_share(),
            &transaction_hash,
            &identities,
        );
        let signature_share = round2::sign(
            &signing_package.frost_signing_package,
            &nonces,
            key_package,
            randomizer,
        )
        .expect("should be able to create signature share");
        signature_shares.insert(identity.to_frost_identifier(), signature_share);
    }

    // coordinator creates signed transaction
    let signed_transaction = unsigned_transaction
        .aggregate_signature_shares(
            &key_packages.public_key_package,
            &signing_package.frost_signing_package,
            signature_shares,
        )
        .expect("should be able to sign transaction");

    assert_eq!(signed_transaction.spends.len(), 1);
    assert_eq!(signed_transaction.outputs.len(), 3);
    assert_eq!(signed_transaction.mints.len(), 1);
    assert_eq!(signed_transaction.burns.len(), 0);

    // verify transaction
    verify_transaction(&signed_transaction).expect("should be able to verify transaction");
}

#[test]
fn test_sign_zondax() {
    let spender_key =
        SaplingKey::from_hex("eedb03842adc584156cc3bad24d9c576b24362e0fd859ae5373983321204ba05")
            .unwrap();

    let unsigned_transaction_bytes = hex_to_vec_bytes("0201000000000000000200000000000000000000000000000000000000000000000100000000000000000000002c23b3915d26540f2ecfcf138bb51f145f53b9d877e7b3826d40d9e6ff9080d82cd1197250b281e33bd1a07596ca592945921e1aca567a5c5b6312127407b6002cd1197250b281e33bd1a07596ca592945921e1aca567a5c5b6312127407b600af5ea5e0945ce8b007fa185929d64ef00920ba7451fde8ea27ee0ddfd845e2724ca90700eed1be5e8a293ac8576d7122b370af823e472c064ea890a103cac5f9a7813ddbd0beec2967cdfd3db8fb34317c7052b257a17df1551717a05efbd26f054828dbf424e4b07cf7b0e5ff1569a3f712cdd377c00eadde037b0126c59c468945a6c317eb334451ea23b4d7b8cf21b329269c5786122e9b21e345505163d3ca7d8d0104808f86fa352d46687f903957fc40f33ca89f2736ca01607a389d4b2151de24a15cc35771b5095008c1963b694e561d81746696da13c5b04eaabb6b0e3f684b198e277582eaffd70e2106fb6587e7bd1d8879ce89c42f9baf586648780500008a2895e8293d5bbc0344ccf5854c313b3bc1449955aa61307fdf643a4c2d3da100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a31d76fb30429f838635364df372112f330ed43222451945ca3cb1d38a256b70e5677be0a8be52efbd68f019eaeaf1b7b554aa988a49bf830a40e20b6d1fbd0a9633f60d4d39a99523f1aa7c1d07ee1044bbe020fb13edd03ab47a8e0167c24e057185d2dc25846d1069484d75c11939ea11235e1da041267e57e1a59ec1b639efd9bd209e016e9b643cfc801f931c6c9340ac130c1304d6458b2aa7fffd2b506df411b56549d4571acd4621db5fc3e366a2aa38da3d49506c9ee1de84467225ad6592cc2ecd9830fd7923ed6d4770eb1b5fe790dc98f2f57c16feb2bb7747d54ae2fbf4fd5974be44f22971bcae6ad19f38842e5d48399b2c4afe8cc16c4b4eca876887b7797dea7f5d7b16e2123602d9739831890e87db5948e8152fbebfe4814398bd7f4c37fce857374a3c79394326fffca81d83d903062ae354859e7d503225c25462bc3168404602d186b749f639e0f3604d6145cb74c14787cb433e6704ee8168aceece474bddff70447d59cd2582d3075b6f8ae0cab4cd7d1e74849875828b4413e7f80b5ab695359439ba1a9e9f23bc2bfe7f181c3d8f422d1a68bec25b9a4132af125712602def13b2a93fb7e4951f7f878d7543747364e0a40f81f4a415df00fffc1fc8cf2be472b325224dc5c1dd8d78b9b7d270ecba38e4bd0c0579ddc3cf179ce667ce8ae6269688fa8d64699d7e9325c240fc575262142406f96f4777dbb800229268790cfb9476cd0a274362682c4e53627c036efd6972f6f4aed48d76c22f50bb783af6064958b0b14a235f91d9332d9620c82cfc275bcab024d77a43e7eb94c6020eeb8ff0ec37f9d3bfdebef8c487b0db4207354b39e294d774c1f1d0091607ea88730a5e0e90c691ecbdfc6c3424710c418215fd4375480c99960fa4cf927b99ac538aa2b61ede02290bb13b007da8b47d0b5d8add3058109bbc88dcb504dcc87c5de26a7fe2c2fbfa1b60a94a6c5b067bd16c5145b95e6872516e132784b9c8b73348ade3eccd7b1d9a9eba0a0d16f648532e27d25fa0ed629b68a19ac62726f8c827ff074a522990bfb62f25728cf0fcbc976baecbe8ef5e78f5bd0c11b0c5c1384b14fd7fb84fe9630fef0a2625e838a4593b85e088823db2c74e198aa8e2be9d7553cc3cad2b781aa6507f681b0d4f1dd32df0c7f84714d6392aee045240b2313d7aefe1a5ce7371f7fde3dcdf92a716f9f4ce230efbb430d671c9fd4972daa55db027813601e465ab376a3e4abc778953bbf9cc92f8f5199852cce5638451c683cdebc912663c29be6f3512e7fbc83d1a6a0e66acd3e4fb50619436b9b9e4342d1b24f4ea3c7cfd38baca95e0765aa14f5f034982d2c238c32c829cf56efc7a9daee7833fffdede0e6dfcb45f8ff79fdef2757774c65434f83840a2d1037cbc35890e3bf897f8e60fa073af65036fe8fb82eb87b412624a9ce2b96536e8bcd954f50e9925df0c446a691ee91ea040d9da0dca304b83370e4e0933f6aaba81266a1221a5db24a5b3204981f2148e2f7e15f0884131a47d5d97d1b85f2dc7c4e05e42370e").expect("should read unsigned transaction bytes");

    let unsigned_transaction = UnsignedTransaction::read(&unsigned_transaction_bytes[..])
        .expect("should deserialize unsigned transaction");

    let transaction_hash_bytes = unsigned_transaction.transaction_signature_hash().unwrap();
    println!("{}", bytes_to_hex(&transaction_hash_bytes));
    println!("c5031c241ee5e89776d1964bd2247eb50b04b096bc29d683f80be71636486b97");

    let private_key = redjubjub::PrivateKey(spender_key.spend_authorizing_key);
    let randomized_private_key = private_key.randomize(unsigned_transaction.public_key_randomness);

    let transaction_randomized_public_key =
        redjubjub::PublicKey(spender_key.view_key.authorizing_key.into()).randomize(
            unsigned_transaction.public_key_randomness,
            *SPENDING_KEY_GENERATOR,
        );

    let mut data_to_be_signed = [0; 64];
    data_to_be_signed[..TRANSACTION_PUBLIC_KEY_SIZE]
        .copy_from_slice(&transaction_randomized_public_key.0.to_bytes());
    data_to_be_signed[32..].copy_from_slice(&transaction_hash_bytes[..]);

    let signature = randomized_private_key.sign(
        &data_to_be_signed,
        &mut thread_rng(),
        *SPENDING_KEY_GENERATOR,
    );

    let mut serialized_signature = vec![];
    signature
        .write(&mut serialized_signature)
        .expect("serializing signature should not fail");

    println!("{}", bytes_to_hex(&serialized_signature));
    println!("00115b9e1d1bf1b2f917478055884dc9a3457d427bba82db5c5207ec73ce452fd0029511f26281c174501f88ddce26df48458b34d9079027ab92116ede992b0d")
}
