/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::{IronfishError, IronfishErrorKind},
    transaction::Transaction,
};

#[cfg(feature = "transaction-proofs")]
use crate::{
    assets::{asset::Asset, asset_identifier::NATIVE_ASSET},
    frost_utils::{account_keys::derive_account_keys, split_spender_key::split_spender_key},
    keys::SaplingKey,
    merkle_note::NOTE_ENCRYPTION_MINER_KEYS,
    note::Note,
    sapling_bls12::SAPLING,
    test_util::{create_multisig_identities, make_fake_witness},
    transaction::{
        verify::batch_verify_transactions, verify::internal_batch_verify_transactions,
        verify_transaction, ProposedTransaction, TransactionVersion, TRANSACTION_EXPIRATION_SIZE,
        TRANSACTION_FEE_SIZE, TRANSACTION_PUBLIC_KEY_SIZE, TRANSACTION_SIGNATURE_SIZE,
    },
};
#[cfg(feature = "transaction-proofs")]
use ff::Field;
#[cfg(feature = "transaction-proofs")]
use group::GroupEncoding;
#[cfg(feature = "transaction-proofs")]
use ironfish_frost::{
    dkg::{
        round1::round1 as dkg_round1, round2::round2 as dkg_round2, round3::round3 as dkg_round3,
    },
    frost::{round2, round2::SignatureShare, Identifier, Randomizer},
    nonces::deterministic_signing_nonces,
    participant::Secret,
};
#[cfg(feature = "transaction-proofs")]
use ironfish_zkp::{
    constants::{ASSET_ID_LENGTH, SPENDING_KEY_GENERATOR, TREE_DEPTH},
    proofs::{MintAsset, Output, Spend},
    redjubjub::{self, Signature},
};
#[cfg(feature = "transaction-proofs")]
use rand::thread_rng;
#[cfg(feature = "transaction-proofs")]
use std::collections::{BTreeMap, HashMap};

#[test]
#[cfg(feature = "transaction-proofs")]
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
#[cfg(feature = "transaction-proofs")]
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
#[cfg(feature = "transaction-proofs")]
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
#[cfg(feature = "transaction-proofs")]
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
#[cfg(feature = "transaction-proofs")]
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
#[cfg(feature = "transaction-proofs")]
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
#[cfg(feature = "transaction-proofs")]
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
#[cfg(feature = "transaction-proofs")]
fn test_batch_verify_wrong_spend_params() {
    let rng = &mut thread_rng();

    let wrong_spend_params =
        ironfish_bellperson::groth16::generate_random_parameters::<blstrs::Bls12, _, _>(
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

    let wrong_spend_vk =
        ironfish_bellperson::groth16::prepare_verifying_key(&wrong_spend_params.vk);

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
    let asset = Asset::new(other_key.public_address(), "Othercoin", "").unwrap();

    let mut proposed_transaction1 = ProposedTransaction::new(TransactionVersion::latest());

    proposed_transaction1.add_spend(in_note, &witness).unwrap();
    proposed_transaction1.add_output(out_note).unwrap();

    let transaction1 = proposed_transaction1
        .post(&key, None, 1)
        .expect("should be able to post transaction");

    let mut proposed_transaction2 = ProposedTransaction::new(TransactionVersion::latest());
    proposed_transaction2.add_mint(asset, 5).unwrap();

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
}

#[test]
#[cfg(feature = "transaction-proofs")]
fn test_batch_verify_wrong_output_params() {
    let rng = &mut thread_rng();

    let wrong_output_params =
        ironfish_bellperson::groth16::generate_random_parameters::<blstrs::Bls12, _, _>(
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

    let wrong_output_vk =
        ironfish_bellperson::groth16::prepare_verifying_key(&wrong_output_params.vk);

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
    let asset = Asset::new(other_key.public_address(), "Othercoin", "").unwrap();

    let mut proposed_transaction1 = ProposedTransaction::new(TransactionVersion::latest());

    proposed_transaction1.add_spend(in_note, &witness).unwrap();
    proposed_transaction1.add_output(out_note).unwrap();

    let transaction1 = proposed_transaction1
        .post(&key, None, 1)
        .expect("should be able to post transaction");

    let mut proposed_transaction2 = ProposedTransaction::new(TransactionVersion::latest());
    proposed_transaction2.add_mint(asset, 5).unwrap();

    let transaction2 = proposed_transaction2.post(&other_key, None, 0).unwrap();
    //
    // END TRANSACTION CREATION
    //

    batch_verify_transactions([&transaction1, &transaction2])
        .expect("Should verify using Sapling params");
    internal_batch_verify_transactions(
        [&transaction1, &transaction2],
        &SAPLING.spend_verifying_key,
        &wrong_output_vk,
        &SAPLING.mint_verifying_key,
    )
    .expect_err("Should not verify if output verifying key is wrong");
}

#[test]
#[cfg(feature = "transaction-proofs")]
fn test_batch_verify_wrong_mint_params() {
    let rng = &mut thread_rng();

    let wrong_mint_params =
        ironfish_bellperson::groth16::generate_random_parameters::<blstrs::Bls12, _, _>(
            MintAsset {
                proof_generation_key: None,
                public_key_randomness: None,
            },
            rng,
        )
        .unwrap();

    let wrong_mint_vk = ironfish_bellperson::groth16::prepare_verifying_key(&wrong_mint_params.vk);

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
        &SAPLING.spend_verifying_key,
        &SAPLING.output_verifying_key,
        &wrong_mint_vk,
    )
    .expect_err("Should not verify if mint verifying key is wrong");
}

#[test]
#[cfg(feature = "transaction-proofs")]
fn test_batch_verify() {
    let key = SaplingKey::generate_key();
    let other_key = SaplingKey::generate_key();

    let public_key_randomness = ironfish_jubjub::Fr::random(thread_rng());
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
#[cfg(feature = "transaction-proofs")]
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
#[cfg(feature = "transaction-proofs")]
fn test_sign_key_mismatch_failure() {
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

    // sign with different, mismatched key
    let signer_key = SaplingKey::generate_key();
    let signed_transaction = unsigned_transaction
        .sign(&signer_key)
        .expect("should be able to sign transaction");

    // verify transaction
    verify_transaction(&signed_transaction).expect_err("should not be able to verify transaction");
}

#[test]
#[cfg(feature = "transaction-proofs")]
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
#[cfg(feature = "transaction-proofs")]
fn test_add_signature_by_building_transaction() {
    let spender_key = SaplingKey::generate_key();

    // create notes

    let in_note = Note::new(
        spender_key.public_address(),
        42,
        "",
        NATIVE_ASSET,
        spender_key.public_address(),
    );

    let out_note = Note::new(
        spender_key.public_address(),
        40,
        "",
        NATIVE_ASSET,
        spender_key.public_address(),
    );

    let mut transaction = ProposedTransaction::new(TransactionVersion::latest());

    transaction
        .add_spend(in_note.clone(), &make_fake_witness(&in_note.clone()))
        .unwrap();

    transaction.add_output(out_note).unwrap();

    let public_address: crate::PublicAddress = spender_key.public_address();

    let intended_fee = 1;

    let mut unsigned_transaction = transaction
        .build(
            spender_key.proof_authorizing_key,
            spender_key.view_key().clone(),
            spender_key.outgoing_view_key().clone(),
            intended_fee,
            Some(public_address),
        )
        .expect("should be able to build unsigned transaction");

    let private_key = redjubjub::PrivateKey(spender_key.spend_authorizing_key);
    let randomized_private_key = private_key.randomize(unsigned_transaction.public_key_randomness);
    let transaction_hash_bytes = unsigned_transaction.transaction_signature_hash().unwrap();

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

    let mut signature_bytes: [u8; 64] = [0; 64];

    signature.write(signature_bytes.as_mut()).unwrap();

    let signed = unsigned_transaction
        .add_signature(signature_bytes)
        .expect("should be able to sign transaction");

    verify_transaction(&signed).expect("should be able to verify transaction");
}

#[test]
#[cfg(feature = "transaction-proofs")]
fn test_dkg_signing() {
    let secret1 = Secret::random(thread_rng());
    let secret2 = Secret::random(thread_rng());
    let secret3 = Secret::random(thread_rng());
    let identity1 = secret1.to_identity();
    let identity2 = secret2.to_identity();
    let identity3 = secret3.to_identity();
    let identities = &[identity1.clone(), identity2.clone(), identity3.clone()];

    let (round1_secret_package_1, package1) = dkg_round1(
        &identity1,
        2,
        [&identity1, &identity2, &identity3],
        thread_rng(),
    )
    .expect("round 1 failed");

    let (round1_secret_package_2, package2) = dkg_round1(
        &identity2,
        2,
        [&identity1, &identity2, &identity3],
        thread_rng(),
    )
    .expect("round 1 failed");

    let (round1_secret_package_3, package3) = dkg_round1(
        &identity3,
        2,
        [&identity1, &identity2, &identity3],
        thread_rng(),
    )
    .expect("round 1 failed");

    let (encrypted_secret_package_1, round2_public_packages_1) = dkg_round2(
        &secret1,
        &round1_secret_package_1,
        [&package1, &package2, &package3],
        thread_rng(),
    )
    .expect("round 2 failed");

    let (encrypted_secret_package_2, round2_public_packages_2) = dkg_round2(
        &secret2,
        &round1_secret_package_2,
        [&package1, &package2, &package3],
        thread_rng(),
    )
    .expect("round 2 failed");

    let (encrypted_secret_package_3, round2_public_packages_3) = dkg_round2(
        &secret3,
        &round1_secret_package_3,
        [&package1, &package2, &package3],
        thread_rng(),
    )
    .expect("round 2 failed");

    let (key_package_1, public_key_package, group_secret_key) = dkg_round3(
        &secret1,
        &encrypted_secret_package_1,
        [&package1, &package2, &package3],
        [&round2_public_packages_2, &round2_public_packages_3],
    )
    .expect("round 3 failed");

    let (key_package_2, _, _) = dkg_round3(
        &secret2,
        &encrypted_secret_package_2,
        [&package1, &package2, &package3],
        [&round2_public_packages_1, &round2_public_packages_3],
    )
    .expect("round 3 failed");

    let (key_package_3, _, _) = dkg_round3(
        &secret3,
        &encrypted_secret_package_3,
        [&package1, &package2, &package3],
        [&round2_public_packages_1, &round2_public_packages_2],
    )
    .expect("round 3 failed");

    let account_keys = derive_account_keys(public_key_package.verifying_key(), &group_secret_key)
        .expect("account key derivation failed");
    let public_address = account_keys.public_address;

    // create raw/proposed transaction
    let in_note = Note::new(public_address, 42, "", NATIVE_ASSET, public_address);
    let out_note = Note::new(public_address, 40, "", NATIVE_ASSET, public_address);
    let asset = Asset::new(public_address, "Testcoin", "A really cool coin")
        .expect("should be able to create an asset");
    let value = 5;
    let mint_out_note = Note::new(public_address, value, "", *asset.id(), public_address);
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
        .add_change_notes(Some(public_address), public_address, intended_fee)
        .expect("should be able to add change notes");

    // build UnsignedTransaction without signing
    let mut unsigned_transaction = transaction
        .build(
            account_keys.proof_authorizing_key,
            account_keys.view_key,
            account_keys.outgoing_viewing_key,
            intended_fee,
            Some(account_keys.public_address),
        )
        .expect("should be able to build unsigned transaction");

    let transaction_hash = unsigned_transaction
        .transaction_signature_hash()
        .expect("should be able to compute transaction hash");

    let mut commitments = HashMap::new();

    // simulate signing
    // commitment generation
    let identity_keypackages = [
        (identity1, key_package_1),
        (identity2, key_package_2),
        (identity3, key_package_3),
    ];
    for (identity, key_package) in identity_keypackages.iter() {
        let nonces = deterministic_signing_nonces(
            key_package.signing_share(),
            &transaction_hash,
            identities,
        );
        commitments.insert(identity.clone(), (&nonces).into());
    }

    let signing_package = unsigned_transaction
        .signing_package(commitments)
        .expect("should be able to create signing package");

    // simulate round 2
    let mut signature_shares: BTreeMap<Identifier, SignatureShare> = BTreeMap::new();
    let randomizer =
        Randomizer::deserialize(&unsigned_transaction.public_key_randomness.to_bytes())
            .expect("should be able to deserialize randomizer");

    for (identity, key_package) in identity_keypackages.iter() {
        let nonces = deterministic_signing_nonces(
            key_package.signing_share(),
            &transaction_hash,
            identities,
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
            &public_key_package,
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
