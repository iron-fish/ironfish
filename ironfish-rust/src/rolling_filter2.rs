use std::{cmp, io::Cursor};

use murmur3::murmur3_32;
use rand::{thread_rng, RngCore};

pub struct RollingFilterRs2 {
    n_entries_this_generation: u32, // bcoin's entries?
    n_generation: i32,
    n_hash_funcs: u32,
    n_entries_per_generation: u32, // bcoin's limit?
    n_tweak: u32,
    pub data: Vec<u64>,
    // Where is bcoin's "items"?
}

impl RollingFilterRs2 {
    pub fn new(n_elements: u32, fp_rate: f64) -> Self {
        let log_rate = fp_rate.ln();

        let n_hash_funcs = cmp::max(1, cmp::min((log_rate / 0.5_f64.ln()).round() as i32, 50));

        let n_entries_per_generation = (n_elements + 1) / 2;

        let n_max_elements: i32 = (n_entries_per_generation * 3) as i32;

        let n_filter_bits = ((-n_hash_funcs * n_max_elements) as f64
            / (1.0 - (log_rate / n_hash_funcs as f64).exp()).ln())
        .ceil() as u32;

        let data_size = ((n_filter_bits + 63) / 64) << 1;
        let data = vec![0; data_size as usize];

        let n_tweak = thread_rng().next_u32();

        Self {
            n_entries_per_generation,
            n_hash_funcs: n_hash_funcs as u32,
            data,
            n_tweak,
            n_generation: 1,
            n_entries_this_generation: 0,
        }
    }

    // TODO: Static inline?
    fn hash(&self, value: &[u8], n_hash_num: u32) -> u32 {
        let seed = n_hash_num * 0xFBA4C795 + self.n_tweak;

        murmur3_32(&mut Cursor::new(value), seed).unwrap()
    }

    pub fn add(&mut self, value: &[u8]) {
        if self.n_entries_this_generation == self.n_entries_per_generation {
            self.n_entries_this_generation = 0;
            self.n_generation += 1;
            if (self.n_generation == 4) {
                self.n_generation = 1;
            }

            let n_generation_mask_1 = 0 - (self.n_generation as u64 & 1);
            let n_generation_mask_2 = 0 - (self.n_generation as u64 >> 1);

            // wipe out old entries that used this generation number
            for p in (0..self.data.len()).step_by(2) {
                let p1 = self.data[p];
                let p2 = self.data[p + 1];
                let mask = (p1 ^ n_generation_mask_1) | (p2 ^ n_generation_mask_2);
                self.data[p] = p1 & mask;
                self.data[p + 1] = p2 & mask;
            }
        }

        self.n_entries_this_generation += 1;

        for n in 0..self.n_hash_funcs {
            let h = self.hash(value, n);
            let bit = h & 0x3F;
            // This is "FastRange32", found in bitcoin/src/util/fastrange.h
            let pos = (h as u64 * self.data.len() as u64) >> 32;
            self.data[(pos & !1) as usize] = (self.data[(pos & !1) as usize] & !(1u64 << bit))
                | (self.n_generation as u64 & 1) << bit;
            self.data[(pos | 1) as usize] = (self.data[(pos | 1) as usize] & !(1u64 << bit))
                | (self.n_generation as u64 >> 1) << bit;
        }
    }

    pub fn test(&self, value: &[u8]) -> bool {
        for n in 0..self.n_hash_funcs {
            let h = self.hash(value, n);
            let bit = h & 0x3F;
            // This is "FastRange32", found in bitcoin/src/util/fastrange.h
            let pos = (h as u64 * self.data.len() as u64) >> 32;
            // If the relevant bit is not set in either data[pos & !1] or
            // data[pos | 1], the filter does not contain the value
            let bit1 = self.data[(pos & !1) as usize];
            let bit2 = self.data[(pos | 1) as usize];
            if ((bit1 | bit2) >> bit) & 1 == 0 {
                return false;
            }

            // !(
            //     (
            //         (bit1 | bit2) >> bit
            //     ) & 1
            // )

            // (
            //     !(
            //         (
            //             (data[pos & ~1U] | data[pos | 1]) >> bit
            //         ) & 1
            //     )
            // )
        }

        true
    }
}
