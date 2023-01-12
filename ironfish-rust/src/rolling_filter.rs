/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::num::Wrapping;

use rand::{thread_rng, RngCore};
use xxhash_rust::xxh3::xxh3_64_with_seed;

pub struct RollingFilter {
    entries: u32,         // entries currently in this generation
    generation: i32,      // current generation
    hash_func_count: u32, // the number of hash functions to use
    entries_per_generation: u32,
    tweak: u32,     // salt for the hash function
    data: Vec<u64>, // the actual bits used to determine existence
}

impl RollingFilter {
    pub fn new(n_elements: u32, fp_rate: f64) -> Self {
        let log_rate = fp_rate.ln();

        let hash_func_count = ((log_rate / 0.5_f64.ln()).round() as i32).clamp(1, 50);

        let entries_per_generation = (n_elements + 1) / 2;

        let max_elements: i32 = (entries_per_generation * 3) as i32;

        let filter_bits = (-(hash_func_count * max_elements) as f64
            / (1.0 - (log_rate / hash_func_count as f64).exp()).ln())
        .ceil() as u32;

        let data_size = ((filter_bits + 63) / 64) << 1;
        let data = vec![0; data_size as usize];

        let tweak = thread_rng().next_u32();

        Self {
            entries_per_generation,
            hash_func_count: hash_func_count as u32,
            data,
            tweak,
            generation: 1,
            entries: 0,
        }
    }

    fn hash(&self, value: &[u8], n_hash_num: u32) -> u32 {
        let seed = n_hash_num as u64 * 0xFBA4C795 + self.tweak as u64;

        xxh3_64_with_seed(value, seed) as u32
    }

    pub fn add(&mut self, value: &[u8]) {
        if self.entries == self.entries_per_generation {
            self.entries = 0;
            self.generation += 1;
            if self.generation == 4 {
                self.generation = 1;
            }

            let generation_mask_1 = (Wrapping(0) - Wrapping((self.generation & 1) as u64)).0;
            let generation_mask_2 = (Wrapping(0) - Wrapping((self.generation >> 1) as u64)).0;

            // wipe out old entries that used this generation number
            for p in (0..self.data.len()).step_by(2) {
                let p1 = self.data[p];
                let p2 = self.data[p + 1];
                let mask = (p1 ^ generation_mask_1) | (p2 ^ generation_mask_2);
                self.data[p] = p1 & mask;
                self.data[p + 1] = p2 & mask;
            }
        }

        self.entries += 1;

        for n in 0..self.hash_func_count {
            let h = self.hash(value, n);
            let bit = h & 0x3F;
            let pos = (h as u64 * self.data.len() as u64) >> 32;

            self.data[(pos & !1) as usize] = (self.data[(pos & !1) as usize] & !(1u64 << bit))
                | (self.generation as u64 & 1) << bit;
            self.data[(pos | 1) as usize] = (self.data[(pos | 1) as usize] & !(1u64 << bit))
                | (self.generation as u64 >> 1) << bit;
        }
    }

    pub fn test(&self, value: &[u8]) -> bool {
        for n in 0..self.hash_func_count {
            let h = self.hash(value, n);
            let bit = h & 0x3F;
            let pos = (h as u64 * self.data.len() as u64) >> 32;

            let bit1 = self.data[(pos & !1) as usize];
            let bit2 = self.data[(pos | 1) as usize];
            if ((bit1 | bit2) >> bit) & 1 == 0 {
                return false;
            }
        }

        true
    }
}

#[cfg(test)]
mod test {
    use crate::nacl::random_bytes;

    use super::RollingFilter;

    #[test]
    fn test_rolling_filter() {
        let mut filter = RollingFilter::new(1_000, 0.0000001);

        let mut false_positives = 0;
        for _ in 0..5_000 {
            let x = random_bytes(32);
            let false_positive = filter.test(&x);
            if false_positive {
                false_positives += 1;
            }
            filter.add(&x);
        }

        // Realistically, this shouldn't ever be non-zero, but given that
        // strange things can happen when dealing with randomness, and I'd
        // prefer this test to not be flaky, we'll use 3
        assert!(false_positives < 3);
    }
}
