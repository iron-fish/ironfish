/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use neon::prelude::*;

use ironfish_rust::mining;
use ironfish_rust::sapling_bls12;

pub mod structs;

pub trait ToObjectExt {
    fn to_object<'a>(&self, cx: &mut impl Context<'a>) -> JsResult<'a, JsObject>;
}

struct Key {
    spending_key: String,
    incoming_view_key: String,
    outgoing_view_key: String,
    public_address: String,
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

fn generate_key(mut cx: FunctionContext) -> JsResult<JsObject> {
    let hasher = sapling_bls12::SAPLING.clone();
    let sapling_key = sapling_bls12::Key::generate_key(hasher);

    let key = Key {
        spending_key: sapling_key.hex_spending_key(),
        incoming_view_key: sapling_key.incoming_view_key().hex_key(),
        outgoing_view_key: sapling_key.outgoing_view_key().hex_key(),
        public_address: sapling_key.generate_public_address().hex_public_address(),
    };

    key.to_object(&mut cx)
}

fn generate_new_public_address(mut cx: FunctionContext) -> JsResult<JsObject> {
    let private_key = cx.argument::<JsString>(0)?.value(&mut cx);
    let hasher = sapling_bls12::SAPLING.clone();
    let sapling_key = sapling_bls12::Key::from_hex(hasher, &private_key)
        .or_else(|err| cx.throw_error(err.to_string()))?;

    let key = Key {
        spending_key: sapling_key.hex_spending_key(),
        incoming_view_key: sapling_key.incoming_view_key().hex_key(),
        outgoing_view_key: sapling_key.outgoing_view_key().hex_key(),
        public_address: sapling_key.generate_public_address().hex_public_address(),
    };

    key.to_object(&mut cx)
}

fn mine_header_batch(mut cx: FunctionContext) -> JsResult<JsObject> {
    // Argument 1
    let header_buffer = cx.argument::<JsBuffer>(0)?;
    let header_bytes = cx.borrow(&header_buffer, |data| data.as_mut_slice::<u8>());
    // Argument 2
    let initial_randomness = cx.argument::<JsNumber>(1)?.value(&mut cx) as i64;
    // Argument 3
    let target_buffer = cx.argument::<JsBuffer>(2)?;
    let target_slice = cx.borrow(&target_buffer, |data| data.as_slice::<u8>());
    let mut target_array = [0u8; 32];
    target_array.copy_from_slice(&target_slice[..32]);
    // Argument 4
    let batch_size = cx.argument::<JsNumber>(3)?.value(&mut cx) as i64;

    // Execute batch mine operation
    let mine_header_result =
        mining::mine_header_batch(header_bytes, initial_randomness, &target_array, batch_size);

    // Return result
    mine_header_result.to_object(&mut cx)
}

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("generateKey", generate_key)?;
    cx.export_function("generateNewPublicAddress", generate_new_public_address)?;
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

    cx.export_function("mineHeaderBatch", mine_header_batch)?;

    Ok(())
}
