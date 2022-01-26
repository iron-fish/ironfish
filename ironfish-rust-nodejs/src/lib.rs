/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use neon::prelude::*;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use napi::Error;

use ironfish_rust::mining;
use ironfish_rust::sapling_bls12;

pub mod structs;

pub trait ToObjectExt {
    fn to_object<'a>(&self, cx: &mut impl Context<'a>) -> JsResult<'a, JsObject>;
}

#[napi(object)]
pub struct Key {
    pub spending_key: String,
    pub incoming_view_key: String,
    pub outgoing_view_key: String,
    pub public_address: String,
}

impl ToObjectExt for Key {
    fn to_object<'a>(&self, cx: &mut impl Context<'a>) -> JsResult<'a, JsObject> {
        let obj = cx.empty_object();

        let spending_key = cx.string(&self.spending_key);
        obj.set(cx, "spending_key", spending_key)?;

        let incoming_view_key = cx.string(&self.incoming_view_key);
        obj.set(cx, "incoming_view_key", incoming_view_key)?;

        let outgoing_view_key = cx.string(&self.outgoing_view_key);
        obj.set(cx, "outgoing_view_key", outgoing_view_key)?;

        let public_address = cx.string(&self.public_address);
        obj.set(cx, "public_address", public_address)?;

        Ok(obj)
    }
}

impl ToObjectExt for mining::MineHeaderResult {
    fn to_object<'a>(&self, cx: &mut impl Context<'a>) -> JsResult<'a, JsObject> {
        let obj = cx.empty_object();

        let randomness = cx.number(self.randomness);
        obj.set(cx, "randomness", randomness)?;

        let found_match = cx.boolean(self.found_match);
        obj.set(cx, "foundMatch", found_match)?;

        Ok(obj)
    }
}

#[napi]
pub fn generate_key() -> Key {
    let hasher = sapling_bls12::SAPLING.clone();
    let sapling_key = sapling_bls12::Key::generate_key(hasher);

    Key {
        spending_key: sapling_key.hex_spending_key(),
        incoming_view_key: sapling_key.incoming_view_key().hex_key(),
        outgoing_view_key: sapling_key.outgoing_view_key().hex_key(),
        public_address: sapling_key.generate_public_address().hex_public_address(),
    }
}

#[napi]
pub fn generate_new_public_address(private_key: String) -> Result<Key> {
    let hasher = sapling_bls12::SAPLING.clone();
    let sapling_key = sapling_bls12::Key::from_hex(hasher, &private_key)
        .map_err(|err| Error::from_reason(err.to_string()))?;

    Ok(Key {
        spending_key: sapling_key.hex_spending_key(),
        incoming_view_key: sapling_key.incoming_view_key().hex_key(),
        outgoing_view_key: sapling_key.outgoing_view_key().hex_key(),
        public_address: sapling_key.generate_public_address().hex_public_address(),
    })
}

#[napi(object)]
pub struct MineHeaderNapiResult {
    pub randomness: f64,
    pub found_match: bool,
}

#[napi]
pub fn mine_header_batch(mut header_bytes: Buffer, initial_randomness: i64, target_buffer: Buffer, batch_size: i64) -> MineHeaderNapiResult {
    let mut target_array = [0u8; 32];
    target_array.copy_from_slice(&target_buffer[..32]);

    // Execute batch mine operation
    let mine_header_result =
        mining::mine_header_batch(header_bytes.as_mut(), initial_randomness, &target_array, batch_size);

    MineHeaderNapiResult {
        randomness: mine_header_result.randomness,
        found_match: mine_header_result.found_match,
    }
}

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("combineHash", structs::NativeNoteEncrypted::combine_hash)?;

    cx.export_function(
        "noteEncryptedDeserialize",
        structs::NativeNoteEncrypted::deserialize,
    )?;
    cx.export_function(
        "noteEncryptedSerialize",
        structs::NativeNoteEncrypted::serialize,
    )?;
    cx.export_function("noteEncryptedEquals", structs::NativeNoteEncrypted::equals)?;
    cx.export_function(
        "noteEncryptedMerkleHash",
        structs::NativeNoteEncrypted::merkle_hash,
    )?;
    cx.export_function(
        "noteEncryptedDecryptNoteForOwner",
        structs::NativeNoteEncrypted::decrypt_note_for_owner,
    )?;
    cx.export_function(
        "noteEncryptedDecryptNoteForSpender",
        structs::NativeNoteEncrypted::decrypt_note_for_spender,
    )?;

    cx.export_function("noteNew", structs::NativeNote::new)?;
    cx.export_function("noteDeserialize", structs::NativeNote::deserialize)?;
    cx.export_function("noteSerialize", structs::NativeNote::serialize)?;
    cx.export_function("noteValue", structs::NativeNote::value)?;
    cx.export_function("noteMemo", structs::NativeNote::memo)?;
    cx.export_function("noteNullifier", structs::NativeNote::nullifier)?;

    cx.export_function(
        "simpleTransactionNew",
        structs::NativeSimpleTransaction::new,
    )?;
    cx.export_function(
        "simpleTransactionSpend",
        structs::NativeSimpleTransaction::spend,
    )?;
    cx.export_function(
        "simpleTransactionReceive",
        structs::NativeSimpleTransaction::receive,
    )?;
    cx.export_function(
        "simpleTransactionPost",
        structs::NativeSimpleTransaction::post,
    )?;

    cx.export_function("transactionNew", structs::NativeTransaction::new)?;
    cx.export_function("transactionSpend", structs::NativeTransaction::spend)?;
    cx.export_function("transactionReceive", structs::NativeTransaction::receive)?;
    cx.export_function("transactionPost", structs::NativeTransaction::post)?;
    cx.export_function(
        "transactionPostMinersFee",
        structs::NativeTransaction::post_miners_fee,
    )?;
    cx.export_function(
        "transactionSetExpirationSequence",
        structs::NativeTransaction::set_expiration_sequence,
    )?;

    cx.export_function("spendProofNullifier", structs::NativeSpendProof::nullifier)?;
    cx.export_function("spendProofRootHash", structs::NativeSpendProof::root_hash)?;
    cx.export_function("spendProofTreeSize", structs::NativeSpendProof::tree_size)?;

    cx.export_function(
        "transactionPostedDeserialize",
        structs::NativeTransactionPosted::deserialize,
    )?;
    cx.export_function(
        "transactionPostedSerialize",
        structs::NativeTransactionPosted::serialize,
    )?;
    cx.export_function(
        "transactionPostedVerify",
        structs::NativeTransactionPosted::verify,
    )?;
    cx.export_function(
        "transactionPostedNotesLength",
        structs::NativeTransactionPosted::notes_length,
    )?;
    cx.export_function(
        "transactionPostedGetNote",
        structs::NativeTransactionPosted::get_note,
    )?;
    cx.export_function(
        "transactionPostedSpendsLength",
        structs::NativeTransactionPosted::spends_length,
    )?;
    cx.export_function(
        "transactionPostedGetSpend",
        structs::NativeTransactionPosted::get_spend,
    )?;
    cx.export_function(
        "transactionPostedFee",
        structs::NativeTransactionPosted::fee,
    )?;
    cx.export_function(
        "transactionPostedTransactionSignature",
        structs::NativeTransactionPosted::transaction_signature,
    )?;
    cx.export_function(
        "transactionPostedHash",
        structs::NativeTransactionPosted::hash,
    )?;
    cx.export_function(
        "transactionExpirationSequence",
        structs::NativeTransactionPosted::expiration_sequence,
    )?;

    Ok(())
}
