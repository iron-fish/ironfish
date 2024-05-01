/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::collections::{BTreeMap, HashMap};

#[cfg(test)]
use super::internal_batch_verify_transactions;
use super::unsigned::UnsignedTransaction;
use super::{ProposedTransaction, Transaction};
use crate::serializing::hex_to_vec_bytes;
use crate::test_util::create_multisig_identities;
use crate::transaction::tests::split_spender_key::split_spender_key;
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
fn test_aggregate_signature() {
    let unsigned = "0101000000000000000200000000000000000000000000000000000000000000000100000000000000000000001d4a95c1b3efd2fe83e68691fdc6c92a86491aa59dd2b59c496359a9443724cc0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000095e1a029dcc8362a8322d1947e9749398ce9f0201e4c5d1b7ea40113b73b72caddb3fa72ca68e2c9e700a817b50178418224fe0112593d5ef794fa4776e0f12733ef3824e78034a7cdd06fd4353b21b3a41b99103c23b696f83f3c0aae24f5d7146037978dece5028bec77edaec78d4e814b8252d522cada4900311b16557cf5851ad7fbd8a0b40925a682abead20f36b50a8b8346f9a5f025d72309a69383ba1b359bfc208f67152347b245ad9e8933775727fb6b144f5de1608d07a461663fcf506a3548246e67dcc124ef0ad99efe0c7c4f4db7738910757c6e843084955f577a58fb23c0c86a18705b73e39db7d2a1d6539661a8fd9a04a203055734995245140000a456a85b66aa5727f1c7a86bceb98d4e0d019d23aafe31399ee7cc7e1f1df62a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000b1944496dd1c9b1767cc75498e87b82e019a74aec979d2669f318a1b3267ea647ca156584c571a1e9be1c5284bb68f1c80b6aedf50df87f91cdbd206b568779ad5e5896305ced468d9415aaad5d29e067229bae5c0bfc2c9a676b2ba74157de80aa702e539488403377a1eb674465a75ad7474352ed42d553eca5d6e11dc5f13211c0c6b3ae370d1687bfe6cc1edf4bd8b3c301a3e7fbe5ebff5b87400dd80fb3a6c399d89e4d9760828eef835dc07c541183da48cc97f44cb3524b0aaa5648ca6001226c8be9d5950d08e8afd8330d985e75e63082dd1b3c82caad34d2f9485eac3ce328acf8803ac4f5ffe6a84989565e2d1bb22c77398becb202f26166f45cfbed3d8e6f1be74abcc7dd312113faf8606b807afd1f1dadd7148296b8cb2459d2eb79553da46347de38debd71903651ea89e5ee045988c044d935a2f8f3b9def39fc50d9de56f9f78b6b7273dd0a8a06a952efa277a64b8d7c6aaa37418e0ccfdbd92dba2e1672b6e264807616e05cec6df8cbc5d983d8df79bb22f948ac0eb4e9bcaa968c8e20ce8049e21194d893e33b7f729d9e6f49424eba83ff6eab391dea1f9ac8862c6e0439e524b5f23872ee43b6032f84854e2734b05c809c646a87c5d7a88276efb2fd3af0136e19708481e80aabf83686a873e6102695b1baca05e5bba8de509009114209042c6e641d645091a366ff4ccc8c4f4e77531d12adb0784c460fc90c9eb0f59e8b2c8db7db21eaef69628205eedbafc4894e90738ce2ba9990825e82215d9edebe4375bec01d58c1a8ed14784a921ab1c1f7ab76acc1cd72c28075bb3522e924dbef610471da17e00e43a89f2bc0eb55c823e3dd4b04e6097cfb3743c307d4b5ed209a8aa9ae6f7697fb39ebee87d9206f3883ed84049b177a1e58798fc9f83b9a4d4f5be5459a8d13d6e3864f9278bb9b7979648995ff3cb3024d522243502fc512efc1ef758fc981a5d2743176c059d2278494b9f6c5d2f4af36d7c15374dac3a2cf8976b80b5bc740b6803de0da5e06fff6ad9f4d8e1069526825a923d40516730ba7cceb07e03e570715ca47588cdae316abbbc7b99eb682039e2d84edffd3455104fbaddeb39c90f6abd584658ca7e394d771f76fd5db8dd4842f0dbe28a393fadace3cc4ab05023a77f75832456dfdc2caec1aebf08c03ced8c5db6901865e08701dd1fcae325f2d5edd985bb1049133c07f7fcc4100fa0a9d73cfcdd926640fd92c7a0532f3a8e68a0796a1f44adb316c9be18df224acf86612233c986e486360f8a3dcb8105d676a52fe76722879991b3a95f0eca67fd4a4d4701499996d68222dce096d384604ff5276ebeb698376903983987aa473a46d619149d14b8de599d016b6f006f1b397d03100b9b2a188a797c79a7efbc988bc514dc87d3ac8d9252f755b1b37d26a05ab2737af966cef0ec678a03d310f9ef35acab679e66c53e6b0f4871eb1893c3e06dbc2de8288f1c43f0e4ef70852353b1758a7f33ec42d9984c187f5b1f905e2501edf8e75d48957c14c5537c5cedb4125b6047f066bad4903";
    let bytes = hex_to_vec_bytes(unsigned).expect("invalid hex");
    let mut unsigned_transaction = UnsignedTransaction::read(&*bytes).expect("invalid bytes");
    let signed_transaction = unsigned_transaction
        .add_signature("a8bc8cb9af898f90b413ab475cb556f1ef4853f117f4c710bbf86affc8d4b72714682fb95063d83b408796ceab6044e0ab7058669fb06483bea5f7d6584f5103".to_string())
        .expect("error aggregating signatures");

    verify_transaction(&signed_transaction).expect("should be able to verify transaction");
}

#[test]
fn test_aggregate_signature_burn() {
    // 2 spends, 2 outputs, 1 burn
    let unsigned = "010200000000000000020000000000000000000000000000000100000000000000010000000000000051aa08009ec4cc95b7af5248a79d1ca8c865fec97df1cab69422eeff6451f4d3cacb06a2f00215b388896287ff7ca68a6df7108ade7026ba0b237bd9b3bb4531f9e51b06f00215b388896287ff7ca68a6df7108ade7026ba0b237bd9b3bb4531f9e51b06863da374b9f09c3367c8b61417863169b91b3f85bf19dd6c2416cd345b0812dc7f848dffa17aeb773ba9857be74e1bd9b455b9d7b6f9e557cc9eaae80d00602836d242e8aa4b8ab666f9aafbe4d01d36f6b21dd9a65f3a3181d6c6d760979f2e0d805360c3db29e98395f4c842e94d45419358b6ed6eb824ebe93ec2d936558b9461530510b0ea415ef60a2fd89b976a93374f6564a29195088a261c369339140bd0fd561df211713d9aad33a853d3e79fb568044d82896f1b79e26a8b6876746aa8d2f9d969725ea1304c6b33bc3be9dbe01f2d90b164b7113a95b03401d8e0a3aef5b90f4d8e10a117b54be558ef94dc04a763646796b6ab20878378f2330bfc1b09004a9a75ebdfe9a7851f1f6a4a461475099170e2b1f1a8a9df20fa7559ab96c06200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f00215b388896287ff7ca68a6df7108ade7026ba0b237bd9b3bb4531f9e51b06913a70e0f37a1031e356670d3c1c40f99694ece903d24c0042410976b09052af214791e5efffcd802a20b4a878a9eaabae2700f03cc8d047fbe41fbc38a1674a0d9d5792da3f2a3339031b48f587c70f8d081940605295c7da2bf3c12cc042f5048c0c65453d7dbfa493e42c63778894a50c76c8fbe938adc030f514d18bcd563842389cb96fd7b8d3d402a36c32249b8a7984bf07c67847476096d19c0c6525ab672e8fe3ad279df3ce7098aa502f34ee0e67a68f92d18a2e72b439037c29c9c84a10f9307ede4c5195c08d84d7b4a60d970793dd3059e3d9151e05a47fafaba3aef5b90f4d8e10a117b54be558ef94dc04a763646796b6ab20878378f2330bfc1b09007d54a171663946351df01c6d9f1134af8764f655cc97e2288ad60ebf392a49f200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a7a0aee1cf118181c4c20476ff71587663a76a483a6ff4b6677ef6751211a98a9bb16011dee821e0af23b04b175888a490fb2387151c6684bfec5fd48e88b2f8c36d9b43f26243dab6c3f15c6b90ccd49c6e3450177530cf50612489cbbf34f11141dccc294829ff3adb83bd1d1e6e26582c266703bc12eb63a657ecac7c1abf73646acd3a385b5b7dfd785289c5a655a4a0db959825de162bb4e320c21f8a419f5de1ab79aea485ad52a99be7e6f04efce1679dbbb3c878519e71517475fc38321c5bdad492cfe68f31cbcd0c35181078a486343fb6c481792d6b0efe71030effc306cd7236d747f0611bd217ec18f156f28e8d9e672c3c228a6345d88f475c894791f84ec122977e33e97317181089b7a256889f7e4344bfe9f3df20579f4e9dc2d6eba71c82f8e4859944c0c9ecb5e46a96d800adf7caa92f920e78c4ef674ea67f90b9d8a38d63a49e93863a7bbda9131145c186b44a86acc2d421dce29ba5e73837ef448cfc388b09709631606203044992be6c765331246bd4e40a3ff1f793653c5241ef61e2d53dd0777fdac1222b28b8b8a104e495f48a43f0065fd94618b172b59df4c1861b1a309ab0db31d836b9d077686e4a707286da06ae71b82817ef7443db900a31dbf58827eb470b93f998d8ceb2ef92f87d7616beae034b089fe4df7d2cfb04e56296d4e3df693163d5db9ce03d837a06ba315d25cc15137cf1db328a070be1b4e064e867bb24c9969f28bf302a268cc45f8e2ec79ad98bfbdcc28d89337a9cd72102835a8705a27f72b6cd2fe53de08fe4481442f01f31988c8c157aef8b3dd680b582fdca75a73535c2dc19367ba46ebe1f4719cf6c5ac54e2e89489f19431481689cd8d49860ec80c4021f96ac724dc984777db0136dcb9e4d7188ddfd9b0738b3e01528fe9b9c04934695003fd2a4f72f7235ef5f0f6cdd84d08e544475cf767987ca0b7338d32e511a043c9b83e19fe72b35d56999226ad4f353dbfc189915abf0126c9a518b6ce36c35742bca256eac9e211c8984378a1500fa14834309aa743c8f423d686d020f1216f3df0ee43664baacf9ce031bc65cf845a5f35c65963bb7b9e14c7250d2fbbebe2a8db0538498ac98cb12a77da7e686d11a648284a52b3b53759b89987744b0fdae01bcf4bbcfa55227f58acf4c8aae020c083afa6f7853d0b366fefb056fdbae9c099a9f3c5b0736730579529cb485ffc3ebbc8ac82ec33e81a198e8ea4809baa99f373d6d0491a20e05bab009cf26de4daefec7a9b3b5ee69afde847b079d711a4a42761595300e91ecef29256f5a2b90ef81dbb64321f3bb1fadd64153d1890da5c75bfbb966d67a427d08617edd90e841ecb33205b628c17249b7465c7a585e67f21506cf294c0410a4efbd7bc7ee9efaedb98282bb201cfa57951b879966c1ba220bed4dd66bfaef66faeeea688151cdc1ef1bc79d2db6f14ad2266b3b97bee895a849a0cf61257bb6245b2bae8a59e5b15559370a1711ad26d007000000000000a17af4b016a040b36efec3447bc33f476d50c3b6f55e78e6a3afa7e8b44b0092cd782bb01b3c72c2d745ed2880e9f60ad25f17a2b396e65b01c778fac5d93f0a";

    let bytes = hex_to_vec_bytes(unsigned).expect("invalid hex");
    let mut unsigned_transaction = UnsignedTransaction::read(&*bytes).expect("invalid bytes");

    let signed_transaction = unsigned_transaction
        .add_signature("1d357ffd11c5053e69e34bba23c2f06d5b364893489419c6cc6242f25024cdb22bf27694d6e546085537c28ff0ccb936ad5b03b6ef9cb6440ef49a58dde2eb0b".to_string())
        .expect("error aggregating signatures");

    verify_transaction(&signed_transaction).expect("should be able to verify transaction");
}
