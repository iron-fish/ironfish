use super::*;
use bls12_381::{Bls12};
use jubjub::Fr;
use crate::primitives::constants::GH_FIRST_BLOCK;

impl PoseidonEngine for Bls12 {
    type Params = Bls12PoseidonParams;
    type SBox = QuinticSBox;
}

pub struct Bls12PoseidonParams {
    t: u32,
    r_f: u32,
    r_p: u32,
    full_round_keys: Vec<Fr>,
    partial_round_keys: Vec<Fr>,
    mds_matrix: Vec<Fr>,
    security_level: u32,
}

impl Bls12PoseidonParams {
    pub fn new<H: GroupHasher>() -> Self {
        let t = 6u32;
        let r_f = 8u32;
        let r_p = 57u32;
        let security_level = 126u32;

        Self::new_for_params::<H>(t, r_f, r_p, security_level)
    }

    pub fn new_for_params<H: GroupHasher>(t: u32, r_f: u32, r_p: u32, security_level: u32) -> Self {
        
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
                let mut h = H::new(&tag[..]);
                h.update(GH_FIRST_BLOCK);
                h.update(&nonce_bytes[..]);
                let h = h.finalize();
                assert!(h.len() == 32);

                let mut constant_repr = Fr::Repr::default();
                constant_repr.read_le(&h[..]).unwrap();

                if let Ok(constant) = Fr::from_repr(constant_repr) {
                    if !constant.is_zero() {
                        round_constants.push(constant);
                    }
                }

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
                let mut h = H::new(&tag[..]);
                h.update(GH_FIRST_BLOCK);
                h.update(&nonce_bytes[..]);
                let h = h.finalize();
                assert!(h.len() == 32);

                let mut constant_repr = Fr::Repr::default();
                constant_repr.read_le(&h[..]).unwrap();

                if let Ok(constant) = Fr::from_repr(constant_repr) {
                    if !constant.is_zero() {
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
                let mut h = H::new(&tag[..]);
                h.update(GH_FIRST_BLOCK);
                let h = h.finalize();
                assert!(h.len() == 32);
                let mut seed = [0u32; 8];
                for i in 0..8 {
                    seed[i] = (&h[..])
                        .read_u32::<BigEndian>()
                        .expect("digest is large enough for this to work");
                }

                Rng::from_seed(&seed)
            };

            generate_mds_matrix::<Bls12, _>(t, &mut rng)
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
    fn full_round_key(&self, round: u32) -> &[Fr] {
        let t = self.t;
        let start = (t * round) as usize;
        let end = (t * (round + 1)) as usize;

        &self.full_round_keys[start..end]
    }
    fn partial_round_key(&self, round: u32) -> &[Fr] {
        let t = self.t;
        let start = (t * round) as usize;
        let end = (t * (round + 1)) as usize;

        &self.partial_round_keys[start..end]
    }
    fn mds_matrix_row(&self, row: u32) -> &[Fr] {
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

    #[test]
    fn test_generate_bls12_poseidon_params() {
        let params = Bls12PoseidonParams::new();
    }

    #[test]
    fn test_bls12_poseidon_hash() {
        let rng = &mut rand::thread_rng();
        let params = Bls12PoseidonParams::new();
        let input: Vec<Fr> = (0..params.t()).map(|_| rng.gen()).collect();
        let output = poseidon_hash::<Bls12>(&params, &input[..]);
        assert!(output.len() == 1);
    }
}
