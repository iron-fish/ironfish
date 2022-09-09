use std::cmp;

use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use rand::{thread_rng, RngCore};
use xxhash_rust::xxh3::xxh3_64_with_seed;

pub struct RollingFilterRs {
    entries: u32,
    generation: u8,
    n: u32,
    limit: u32,
    size: u32,
    items: u32, // TODO: This can be a usize
    tweak: u32,
    filter: Vec<u8>, // TODO: Final type?
}

impl RollingFilterRs {
    /// Create a rolling bloom filter
    pub fn new(items: Option<u32>, rate: f32) -> Self {
        let mut filter = Self {
            entries: 0,
            generation: 1,
            n: 0,
            limit: 0,
            size: 0,
            items: 0,
            tweak: 0,
            filter: vec![],
        };

        if let Some(items) = items {
            filter.from_rate(items, rate);
        }

        filter
    }

    // TODO: Static from_rate

    /// Inject properties from items and FPR
    fn from_rate(&mut self, items: u32, rate: f32) {
        // TODO: What does assert do in release mode? I forgot
        assert!(rate >= 0.0);
        assert!(rate <= 1.0);

        // println!("PASSED ARGS: {}, {}", items, rate);
        let log_rate = rate.ln();
        // println!("log_rate: {}", log_rate);

        let n = cmp::max(1, cmp::min((log_rate / 0.5_f32.ln()).round() as u32, 50));
        // println!("n: {}", n);
        let limit = (items + 1) / 2 | 0;
        // println!("limit: {}", limit);

        let max = limit * 3;
        // println!("max: {}", max);

        let size =
            (-1.0 * n as f32 * max as f32 / (1.0 - (log_rate / n as f32).exp()).ln()).ceil() as u32;
        // println!("size: {}", size);

        let mut items = ((size + 63) / 64 | 0) << 1;
        // println!("items1: {}", items);
        // TODO: This also is a no-op but rust doesnt complain about it
        items >>= 0;
        // println!("items2: {}", items);
        items = cmp::max(1, items);
        // println!("items3: {}", items);

        let tweak = thread_rng().next_u32() >> 0;
        // println!("tweak: {}", tweak);

        let filter = vec![0x00; (items * 8) as usize];
        // println!("filter: {}", filter.len());

        self.n = n;
        self.limit = limit;
        self.size = size;
        self.items = items;
        self.tweak = tweak;
        self.filter = filter;
    }

    /// Perform the murmur3 hash on data
    fn hash(&self, value: &[u8], n: u32) -> u32 {
        let seed = (n.wrapping_mul(0xfba4c795)).wrapping_add(self.tweak | 0);
        // println!("hash seed: {}", seed);

        xxh3_64_with_seed(value, seed.into()) as u32
    }

    fn reset() {
        todo!("This isn't actually ever used by us");
    }

    // pub fn add(&mut self, value: Vec<u8>) {
    pub fn add(&mut self, value: &[u8]) {
        if self.entries == self.limit {
            self.entries = 0;
            self.generation += 1;

            if self.generation == 4 {
                self.generation = 1;
            }

            // TODO: These hex literals can be shorter, maybe?
            let m1 = (self.generation as u32 & 1) * 0xffffffff;
            let m2 = (self.generation as u32 >> 2) * 0xffffffff;
            // println!("m1 {}", m1);
            // println!("m2 {}", m2);

            for i in (0..self.items).step_by(2) {
                let pos1 = i * 8;
                let pos2 = (i + 1) * 8;
                let mut v1 = self.read(pos1 as usize);
                let mut v2 = self.read(pos2 as usize);
                let mhi = (v1.hi ^ m1) | (v2.hi ^ m2);
                let mlo = (v1.lo ^ m1) | (v2.lo ^ m2);
                // println!("pos1 {}", pos1);
                // println!("pos2 {}", pos2);
                // println!("v1 {:#?}", v1);
                // println!("v2 {:#?}", v2);
                // println!("mhi {}", mhi);
                // println!("mlo {}", mlo);

                v1.hi &= mhi;
                v1.lo &= mlo;
                v2.hi &= mhi;
                v2.lo &= mlo;

                self.write(v1, pos1 as usize);
                self.write(v2, pos2 as usize);
            }
        }

        self.entries += 1;

        for i in 0..self.n {
            let hash = self.hash(&value, i);
            let bits = hash & 0x3f;
            let pos = (hash >> 6) % self.items;
            let pos1 = (pos & !1) * 8;
            let pos2 = (pos | 1) * 8;
            let bit = bits % 8;
            let oct = (bits - bit) / 8;
            // println!("hash {}", hash);
            // println!("bits {}", bits);
            // println!("pos {}", pos);
            // println!("pos1 {}", pos1);
            // println!("pos2 {}", pos2);
            // println!("bit {}", bit);
            // println!("oct {}", oct);

            self.filter[(pos1 + oct) as usize] &= !(1 << bit);
            self.filter[(pos1 + oct) as usize] |= (self.generation & 1) << bit;

            self.filter[(pos2 + oct) as usize] &= !(1 << bit);
            self.filter[(pos2 + oct) as usize] |= (self.generation >> 1) << bit;
        }
    }

    // pub fn test(&self, value: Vec<u8>) -> bool {
    pub fn test(&self, value: &[u8]) -> bool {
        if self.entries == 0 {
            return false;
        }

        for i in 0..self.n {
            let hash = self.hash(&value, i);
            let bits = hash & 0x3f;
            let pos = (hash >> 6) % self.items;
            let pos1 = (pos & !1) * 8;
            let pos2 = (pos | 1) * 8;
            let bit = bits % 8;
            let oct = (bits - bit) / 8;

            // TODO Modify the types here so pos and oct are usize, do the same in .add()
            let bit1 = (self.filter[(pos1 + oct) as usize] >> bit) & 1;
            let bit2 = (self.filter[(pos2 + oct) as usize] >> bit) & 1;

            if (bit1 | bit2) == 0 {
                return false;
            }
        }

        true
    }

    fn read(&self, offset: usize) -> Thing {
        let lo = self.filter[offset..]
            .as_ref()
            .read_u32::<LittleEndian>()
            .unwrap();
        let hi = self.filter[offset + 4..]
            .as_ref()
            .read_u32::<LittleEndian>()
            .unwrap();

        Thing { hi, lo }
    }

    fn write(&mut self, value: Thing, offset: usize) {
        self.filter[offset..]
            .as_mut()
            .write_u32::<LittleEndian>(value.lo);
        self.filter[offset + 4..]
            .as_mut()
            .write_u32::<LittleEndian>(value.hi);
    }
}

#[derive(Debug)]
struct Thing {
    hi: u32,
    lo: u32,
}

#[cfg(test)]
mod test {
    use std::time::Instant;

    use crate::{nacl::random_bytes, rolling_filter2::RollingFilterRs2};

    use super::RollingFilterRs;

    #[test]
    fn test_filter() {
        let mut filter = RollingFilterRs::new(Some(25_000), 0.0000001);

        let x = random_bytes(64);
        for _ in 0..75_000 {
            filter.test(&x);
            filter.add(&x);
            // filter.test(x.clone());
            // filter.add(x.clone());
        }

        println!(
            "Size of filter: {}",
            std::mem::size_of_val(&filter) + std::mem::size_of_val(&*filter.filter)
        );
    }

    #[test]
    fn dummy_test() {
        let mut filter = RollingFilterRs::new(Some(10_000), 0.0000001);
        let value = vec![1, 2, 3, 4, 5, 6, 7, 8];
        filter.add(&value);

        println!(
            "Size of filter: {}",
            std::mem::size_of_val(&filter) + std::mem::size_of_val(&*filter.filter)
        );
    }

    #[test]
    fn test_compare_filter() {
        const ITERATIONS: u32 = 5_000_000;
        const SIZE: u32 = 1_000_000;
        let mut filter = RollingFilterRs::new(Some(SIZE), 0.0000001);
        let mut filter2 = RollingFilterRs2::new(SIZE, 0.0000001);

        let mut fp1 = 0;
        let mut fn1 = 0;
        let start1 = Instant::now();
        for _ in 0..ITERATIONS {
            let x = random_bytes(64);
            let fp = filter.test(&x);
            if fp {
                fp1 += 1;
            }
            filter.add(&x);
            let fneg = filter.test(&x);
            if !fneg {
                fn1 += 1;
            }
            // filter.test(x.clone());
            // filter.add(x.clone());
        }
        let dur1 = start1.elapsed();

        let mut fp2 = 0;
        let mut fn2 = 0;
        let start2 = Instant::now();
        for _ in 0..ITERATIONS {
            let x = random_bytes(64);
            let fp = filter2.test(&x);
            if fp {
                fp2 += 1;
            }
            filter2.add(&x);
            let fneg = filter2.test(&x);
            if !fneg {
                fn2 += 1;
            }
            // filter.test(x.clone());
            // filter.add(x.clone());
        }
        let dur2 = start2.elapsed();

        println!(
            "Size of filter: {}",
            std::mem::size_of_val(&filter) + std::mem::size_of_val(&*filter.filter)
        );

        println!(
            "Size of filter2: {}",
            std::mem::size_of_val(&filter2) + std::mem::size_of_val(&*filter2.data)
        );

        println!("Duration 1: {}", dur1.as_millis());
        println!("Duration 2: {}", dur2.as_millis());

        println!("FP 1: {}", fp1);
        println!("FP 2: {}", fp2);

        println!("FN 1: {}", fn1);
        println!("FN 2: {}", fn2);
    }
}
