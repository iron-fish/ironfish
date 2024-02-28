/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use std::sync::mpsc::{self, Receiver};

use super::thread::{FishHashOptions, Thread};

pub struct ThreadPool {
    threads: Vec<Thread>,
    block_found_receiver: Receiver<(u64, u32)>,
    hash_rate_receiver: Receiver<u32>,
    mining_request_id: u32,
}

impl ThreadPool {
    pub fn new(
        thread_count: usize,
        batch_size: u32,
        pause_on_success: bool,
        use_fish_hash: bool,
        fish_hash_full_context: bool,
    ) -> Self {
        let (block_found_channel, block_found_receiver) = mpsc::channel::<(u64, u32)>();

        let (hash_rate_channel, hash_rate_receiver) = mpsc::channel::<u32>();

        let mut threads = Vec::with_capacity(thread_count);
        for id in 0..thread_count {
            let fish_hash_options = FishHashOptions {
                enabled: use_fish_hash,
                full_context: fish_hash_full_context,
            };

            threads.push(Thread::new(
                id as u64,
                block_found_channel.clone(),
                hash_rate_channel.clone(),
                thread_count,
                batch_size,
                pause_on_success,
                fish_hash_options,
            ));
        }

        ThreadPool {
            threads,
            block_found_receiver,
            hash_rate_receiver,
            mining_request_id: 0,
        }
    }

    pub fn new_work(
        &mut self,
        header_bytes: &[u8],
        target: &[u8],
        mining_request_id: u32,
        fish_hash: bool,
        xn_length: u8,
    ) {
        self.mining_request_id = mining_request_id;

        for thread in self.threads.iter() {
            thread
                .new_work(
                    header_bytes.to_vec(),
                    target.to_vec(),
                    mining_request_id,
                    fish_hash,
                    xn_length,
                )
                .unwrap();
        }
    }

    pub fn stop(&self) {
        for thread in self.threads.iter() {
            thread.stop().unwrap();
        }
    }

    pub fn pause(&self) {
        for thread in self.threads.iter() {
            thread.pause().unwrap();
        }
    }

    pub fn get_found_block(&self) -> Option<(u64, u32)> {
        if let Ok((randomness, mining_request_id)) = self.block_found_receiver.try_recv() {
            // Stale work
            if mining_request_id != self.mining_request_id {
                return None;
            }
            return Some((randomness, mining_request_id));
        }
        None
    }

    pub fn get_hash_rate_submission(&self) -> u32 {
        let mut total_hash_rate = 0;
        for hash_rate in self.hash_rate_receiver.try_iter() {
            total_hash_rate += hash_rate
        }
        total_hash_rate
    }
}
