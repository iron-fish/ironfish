use std::convert::TryInto;

use super::*;
use bls12_381::{Bls12};
use ff::{PrimeField, PrimeFieldBits, Field};
use jubjub;
use rand::{rngs::OsRng, prelude::StdRng, SeedableRng};
use crate::primitives::constants::GH_FIRST_BLOCK;
use blake2b_simd::Params as Blake2b;

impl PoseidonEngine for Bls12 {
    type Params = Bls12PoseidonParams;
    type SBox = QuinticSBox;
}

pub struct Bls12PoseidonParams {
    t: u32,
    r_f: u32,
    r_p: u32,
    full_round_keys: Vec<jubjub::Fr>,
    partial_round_keys: Vec<jubjub::Fr>,
    mds_matrix: Vec<jubjub::Fr>,
    security_level: u32,
}

impl Bls12PoseidonParams {
    pub fn new() -> Self {
        let t = 6u32;
        let r_f = 8u32;
        let r_p = 57u32;
        let security_level = 126u32;

        Self::new_for_params(t, r_f, r_p, security_level)
    }

    pub fn new_for_params(t: u32, r_f: u32, r_p: u32, security_level: u32) -> Self {
        
        use byteorder::{BigEndian, ReadBytesExt, WriteBytesExt};

        // generate round constants based on some seed and hashing
        let full_round_constants = {
            let tag = b"Hadesr_f";
            let mut round_constants = vec![];
            let mut nonce = 0u32;
            let mut nonce_bytes = [0u8; 4];

            loop {
                (&mut nonce_bytes[0..4])
                    .write_u32::<BigEndian>(nonce)
                    .unwrap();

                // let mut h = H::new(&tag[..]);
                // h.update(GH_FIRST_BLOCK);
                // h.update(&nonce_bytes[..]);
                // let h = h.finalize();
                // assert!(h.len() == 32);

                let h = Blake2b::new()
                    .hash_length(32)
                    .to_state()
                    .update(GH_FIRST_BLOCK)
                    .update(&nonce_bytes)
                    .finalize();

                // let mut constant_repr = jubjub::Fr::default();
                // constant_repr.to_le_bits(&h[..]).unwrap();
                let constant_repr = jubjub::Fr::from_bytes(&h.as_bytes().try_into().unwrap());

                // if let Ok(constant) = jubjub::Fr::jubjub::from_repr(constant_repr) {
                if constant_repr.is_some().into() {
                    let constant = constant_repr.unwrap();
                    if !constant.is_zero_vartime() {
                        round_constants.push(constant);
                    }
                }
                // if let Ok(constant) = constant_repr {
                //     if !constant.is_zero() {
                //         round_constants.push(constant);
                //     }
                // }
                if round_constants.len() == ((r_f * 2 * t) as usize) {

                    break;
                }

                nonce += 1;
            }

            round_constants
        };

        // generate round constants based on some seed and hashing
        let partial_round_constants = {
            let tag = b"Hadesr_p";
            let mut round_constants = vec![];
            let mut nonce = 0u32;
            let mut nonce_bytes = [0u8; 4];

            loop {
                (&mut nonce_bytes[0..4])
                    .write_u32::<BigEndian>(nonce)
                    .unwrap();

                let h = Blake2b::new()
                    .hash_length(32)
                    .to_state()
                    .update(GH_FIRST_BLOCK)
                    .update(&nonce_bytes)
                    .finalize();

                // let mut constant_repr = jubjub::Fr::Repr::default();
                // constant_repr.read_le(&h[..]).unwrap();
                let constant_repr = jubjub::Fr::from_bytes(&h.as_bytes().try_into().unwrap());

                // if let Ok(constant) = jubjub::Fr::jubjub::from_repr(constant_repr) {
                //     if !constant.is_zero() {
                //         round_constants.push(constant);
                //     }
                // }
                if constant_repr.is_some().into() {
                    let constant = constant_repr.unwrap();
                    if !constant.is_zero_vartime() {
                        round_constants.push(constant);
                    }
                }

                if round_constants.len() == ((r_p * t) as usize) {
                    break;
                }

                nonce += 1;
            }

            round_constants
        };

        let mds_matrix = {            
            // Create an RNG based on the outcome of the random beacon
            let mut rng = {
                let tag = b"Hadesmds";
                // let mut h = H::new(&tag[..]);
                // h.update(GH_FIRST_BLOCK);
                // let h = h.finalize();
                let h = Blake2b::new()
                    .hash_length(32)
                    .to_state()
                    .update(GH_FIRST_BLOCK)
                    .finalize();
                StdRng::from_seed(h.as_bytes().try_into().unwrap())
            };

            generate_mds_matrix(t, &mut rng)
        };

        Self {
            t: t,
            r_f: r_f,
            r_p: r_p,
            full_round_keys: full_round_constants,
            partial_round_keys: partial_round_constants,
            mds_matrix: mds_matrix,
            security_level: 126,
        }
    }
}

impl PoseidonHashParams for Bls12PoseidonParams {
    fn t(&self) -> u32 {
        self.t
    }
    fn r_f(&self) -> u32 {
        self.r_f
    }
    fn r_p(&self) -> u32 {
        self.r_p
    }
    fn full_round_key(&self, round: u32) -> &[jubjub::Fr] {
        let t = self.t;
        let start = (t * round) as usize;
        let end = (t * (round + 1)) as usize;

        &self.full_round_keys[start..end]
    }
    fn partial_round_key(&self, round: u32) -> &[jubjub::Fr] {
        let t = self.t;
        let start = (t * round) as usize;
        let end = (t * (round + 1)) as usize;

        &self.partial_round_keys[start..end]
    }
    fn mds_matrix_row(&self, row: u32) -> &[jubjub::Fr] {
        let t = self.t;
        let start = (t * row) as usize;
        let end = (t * (row + 1)) as usize;

        &self.mds_matrix[start..end]
    }
    fn security_level(&self) -> u32 {
        self.security_level
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use rand::{thread_rng, Rng};

    #[test]
    fn test_generate_bls12_poseidon_params() {
        let params = Bls12PoseidonParams::new();
    }

    #[test]
    fn test_bls12_poseidon_hash() {
        let mut rng = thread_rng();

        let params = Bls12PoseidonParams::new();
        let input: Vec<jubjub::Fr> = (0..params.t()).map(|_| jubjub::Fr::random(&mut rng)).collect();

        let output = poseidon_hash(&params, &input[..]);
        assert!(output.len() == 1);
    }
}
