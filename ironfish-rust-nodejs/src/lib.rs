/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crypto_box::aead::generic_array::GenericArray;
use crypto_box::aead::Aead;
use crypto_box::PublicKey;
use crypto_box::SecretKey;
use ironfish_rust::note::Memo;
use ironfish_rust::sapling_bls12::SAPLING;
use ironfish_rust::Note;
use ironfish_rust::ProposedTransaction;
use ironfish_rust::SaplingKey;
use napi::bindgen_prelude::*;
use napi::threadsafe_function::ErrorStrategy;
use napi::threadsafe_function::ThreadsafeFunction;
use napi::threadsafe_function::ThreadsafeFunctionCallMode;
use napi::Error;
use napi_derive::napi;

use ironfish_rust::mining;
use ironfish_rust::sapling_bls12;
use structs::NativeTransactionPosted;

pub mod structs;

#[napi(object)]
pub struct Key {
    #[napi(js_name = "spending_key")]
    pub spending_key: String,
    #[napi(js_name = "incoming_view_key")]
    pub incoming_view_key: String,
    #[napi(js_name = "outgoing_view_key")]
    pub outgoing_view_key: String,
    #[napi(js_name = "public_address")]
    pub public_address: String,
}

#[napi]
pub fn generate_key() -> Key {
    let sapling_key = SaplingKey::generate_key();

    Key {
        spending_key: sapling_key.hex_spending_key(),
        incoming_view_key: sapling_key.incoming_view_key().hex_key(),
        outgoing_view_key: sapling_key.outgoing_view_key().hex_key(),
        public_address: sapling_key.generate_public_address().hex_public_address(),
    }
}

#[napi]
pub fn generate_new_public_address(private_key: String) -> Result<Key> {
    let sapling_key =
        SaplingKey::from_hex(&private_key).map_err(|err| Error::from_reason(err.to_string()))?;

    Ok(Key {
        spending_key: sapling_key.hex_spending_key(),
        incoming_view_key: sapling_key.incoming_view_key().hex_key(),
        outgoing_view_key: sapling_key.outgoing_view_key().hex_key(),
        public_address: sapling_key.generate_public_address().hex_public_address(),
    })
}

#[napi]
pub fn initialize_sapling() {
    let _ = sapling_bls12::SAPLING.clone();
}

#[napi(constructor)]
pub struct FoundBlockResult {
    pub randomness: String,
    pub mining_request_id: f64,
}

// Miner threadpool
// TODO: Rename
#[napi]
struct ThreadPoolHandler {
    #[allow(dead_code)]
    threadpool: mining::threadpool::ThreadPool,
}
#[napi]
impl ThreadPoolHandler {
    #[napi(constructor)]
    #[allow(dead_code)]
    pub fn new(thread_count: u32, batch_size: u32) -> Self {
        ThreadPoolHandler {
            threadpool: mining::threadpool::ThreadPool::new(thread_count as usize, batch_size),
        }
    }

    #[napi]
    #[allow(dead_code)]
    pub fn new_work(&mut self, header_bytes: Buffer, target: Buffer, mining_request_id: u32) {
        self.threadpool
            .new_work(&header_bytes, &target, mining_request_id)
    }

    #[napi]
    #[allow(dead_code)]
    pub fn stop(&self) {
        self.threadpool.stop()
    }

    #[napi]
    #[allow(dead_code)]
    pub fn pause(&self) {
        self.threadpool.pause()
    }

    #[napi]
    #[allow(dead_code)]
    pub fn get_found_block(&self) -> Option<FoundBlockResult> {
        if let Some(result) = self.threadpool.get_found_block() {
            return Some(FoundBlockResult {
                randomness: format!("{:016x}", result.0),
                mining_request_id: result.1 as f64,
            });
        }
        None
    }

    #[napi]
    #[allow(dead_code)]
    pub fn get_hash_rate_submission(&self) -> u32 {
        self.threadpool.get_hash_rate_submission()
    }
}

#[napi]
struct NativeWorkerPool {
    pool: rayon::ThreadPool,
}

#[napi]
impl NativeWorkerPool {
    #[napi(constructor)]
    // TODO: Take in a thread count
    pub fn new() -> NativeWorkerPool {
        NativeWorkerPool {
            pool: rayon::ThreadPoolBuilder::new()
                .num_threads(6)
                .build()
                .unwrap(),
        }
    }

    #[napi]
    pub fn verify_transaction(
        &self,
        transaction: &NativeTransactionPosted,
        verify_fees: bool,
        callback: JsFunction,
    ) -> napi::Result<()> {
        let tscb: ThreadsafeFunction<(), ErrorStrategy::CalleeHandled> = callback
            .create_threadsafe_function(0, |ctx| ctx.env.get_undefined().map(|v| vec![v]))?;

        let tx = transaction.transaction().clone();

        self.pool.spawn(move || {
            // std::thread::sleep_ms(250);
            if verify_fees && tx.transaction_fee() < 0 {
                tscb.call(Ok(()), ThreadsafeFunctionCallMode::NonBlocking);
                return;
            }

            tx.verify().unwrap();

            tscb.call(Ok(()), ThreadsafeFunctionCallMode::NonBlocking);
        });

        Ok(())
    }

    #[napi]
    pub fn create_miners_fee(
        &self,
        amount_big: BigInt,
        memo: String,
        spend_key: String,
        callback: JsFunction,
    ) -> napi::Result<()> {
        let tscb: ThreadsafeFunction<(), ErrorStrategy::CalleeHandled> = callback
            .create_threadsafe_function(0, |ctx| ctx.env.get_undefined().map(|v| vec![v]))?;

        let amount = amount_big.get_u64().1;

        self.pool.spawn(move || {
            // std::thread::sleep_ms(250);
            let key = SaplingKey::from_hex(&spend_key).unwrap();
            // let miner_key = generate_new_public_address(spend_key).unwrap();
            // let miner_public_address = PublicAddress::from_hex(&miner_key.public_address).unwrap();
            let miner_public_address = key.generate_public_address();
            let miner_note = Note::new(miner_public_address, amount as u64, Memo::from(memo));

            let mut tx = ProposedTransaction::new(SAPLING.clone());
            tx.receive(&key, &miner_note).unwrap();

            tx.post_miners_fee().unwrap();

            tscb.call(Ok(()), ThreadsafeFunctionCallMode::NonBlocking);
        });

        Ok(())
    }
}

#[napi(object)]
pub struct BoxedMessage {
    pub nonce: String,
    pub boxed_message: String,
}

#[napi]
pub fn rust_box_message(
    plain_text_message: String,
    sender_private_key: Uint8Array,
    recipient_public_key: Uint8Array,
) -> BoxedMessage {
    let mut rng = crypto_box::rand_core::OsRng;

    let sender_key: [u8; 32] = sender_private_key.to_vec().try_into().unwrap();
    let recipient_key: [u8; 32] = recipient_public_key.to_vec().try_into().unwrap();

    let sender: SecretKey = SecretKey::from(sender_key);
    let recipient: PublicKey = PublicKey::from(recipient_key);

    let nonce = crypto_box::generate_nonce(&mut rng);

    let c_box = crypto_box::Box::new(&recipient, &sender);

    let ciphertext = c_box
        .encrypt(&nonce, plain_text_message.as_bytes())
        .unwrap();

    BoxedMessage {
        nonce: base64::encode(&nonce),
        boxed_message: base64::encode(&ciphertext),
    }
}

#[napi]
pub fn rust_unbox_message(
    boxed_message: String,
    nonce: String,
    sender_public_key: Uint8Array,
    recipient_private_key: Uint8Array,
) -> String {
    let nonce = base64::decode(nonce).unwrap();
    let nonce = GenericArray::from_slice(&nonce);

    let boxed_message = base64::decode(boxed_message).unwrap();

    let sender_key: [u8; 32] = sender_public_key.to_vec().try_into().unwrap();
    let recipient_key: [u8; 32] = recipient_private_key.to_vec().try_into().unwrap();

    let recipient: SecretKey = SecretKey::from(recipient_key);
    let sender: PublicKey = PublicKey::from(sender_key);

    let c_box = crypto_box::Box::new(&sender, &recipient);

    let cleartext = c_box.decrypt(nonce, &boxed_message[..]).unwrap();

    return String::from_utf8(cleartext).unwrap();
}
