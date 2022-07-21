// taken largely from https://github.com/filecoin-project/rust-fil-proofs/blob/master/filecoin-hashers/src/poseidon.rs 

use std::cmp::Ordering;
use std::hash::{Hash as StdHash, Hasher as StdHasher};
use std::panic::panic_any;

use bellman::{
    gadgets::{boolean::Boolean, num::AllocatedNum},
    ConstraintSystem, SynthesisError,
};
use blstrs::Scalar as Fr;
use ff::{Field, PrimeField};
use generic_array::typenum::{marker_traits::Unsigned, U2};
// use merkletree::{
//     hash::{Algorithm as LightAlgorithm, Hashable},
//     merkle::Element,
// };
use bellman_neptune::{circuit2::poseidon_hash_allocated, poseidon::Poseidon};
use rand::RngCore;

use crate::poseidon::constants::{PoseidonArity, PoseidonMDArity, POSEIDON_CONSTANTS_16,
    POSEIDON_CONSTANTS_2, POSEIDON_CONSTANTS_4, POSEIDON_CONSTANTS_8, POSEIDON_MD_CONSTANTS};

#[derive(Default, Copy, Clone, Debug, PartialEq, Eq)]
pub struct PoseidonHasher {}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct PoseidonFunction(Fr);

impl Default for PoseidonFunction {
    fn default() -> PoseidonFunction {
        PoseidonFunction(Fr::zero())
    }
}

// impl Hashable<PoseidonFunction> for Fr {
//     fn hash(&self, state: &mut PoseidonFunction) {
//         state.write(&self.to_repr());
//     }
// }

// impl Hashable<PoseidonFunction> for PoseidonDomain {
//     fn hash(&self, state: &mut PoseidonFunction) {
//         state.write(&self.0);
//     }
// }

#[derive(Default, Copy, Clone, Debug)]
pub struct PoseidonDomain(pub <Fr as PrimeField>::Repr);

impl AsRef<PoseidonDomain> for PoseidonDomain {
    fn as_ref(&self) -> &PoseidonDomain {
        self
    }
}

impl StdHash for PoseidonDomain {
    fn hash<H: StdHasher>(&self, state: &mut H) {
        StdHash::hash(&self.0, state);
    }
}

impl PartialEq for PoseidonDomain {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

impl Eq for PoseidonDomain {}

impl Ord for PoseidonDomain {
    #[inline(always)]
    fn cmp(&self, other: &PoseidonDomain) -> Ordering {
        (self.0).cmp(&other.0)
    }
}

impl PartialOrd for PoseidonDomain {
    #[inline(always)]
    fn partial_cmp(&self, other: &PoseidonDomain) -> Option<Ordering> {
        Some((self.0).cmp(&other.0))
    }
}

impl AsRef<[u8]> for PoseidonDomain {
    #[inline]
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

impl PoseidonDomain { 
        fn try_from_bytes(raw: &[u8]) -> Self {
        assert!(
            raw.len() == 32,
            "invalid amount of bytes"
        );
        let mut repr = <Fr as PrimeField>::Repr::default();
        repr.copy_from_slice(raw);
        PoseidonDomain(repr)
    }
}

// impl Domain for PoseidonDomain {
//     fn into_bytes(&self) -> Vec<u8> {
//         self.0.to_vec()
//     }

    // fn try_from_bytes(raw: &[u8]) -> Self {
    //     assert!(
    //         raw.len() == PoseidonDomain::byte_len(),
    //         "invalid amount of bytes"
    //     );
    //     let mut repr = <Fr as PrimeField>::Repr::default();
    //     repr.copy_from_slice(raw);
    //     Ok(PoseidonDomain(repr))
    // }

    // fn write_bytes(&self, dest: &mut [u8]) {
    //     assert!(
    //         dest.len() == PoseidonDomain::byte_len(),
    //         "invalid amount of bytes"
    //     );
    //     dest.copy_from_slice(&self.0);
    // }

//     fn random<R: RngCore>(rng: &mut R) -> Self {
//         // generating an Fr and converting it, to ensure we stay in the field
//         Fr::random(rng).into()
//     }
// }

// impl Element for PoseidonDomain {
//     fn byte_len() -> usize {
//         32
//     }

//     fn from_slice(bytes: &[u8]) -> Self {
//         match PoseidonDomain::try_from_bytes(bytes) {
//             Ok(res) => res,
//             Err(err) => panic_any(err),
//         }
//     }

//     fn copy_to_slice(&self, bytes: &mut [u8]) {
//         bytes.copy_from_slice(&self.0);
//     }
// }

impl StdHasher for PoseidonFunction {
    #[inline]
    fn write(&mut self, msg: &[u8]) {
        self.0 = Fr::from_repr_vartime(shared_hash(msg).0).expect("from_repr failure");
    }

    #[inline]
    fn finish(&self) -> u64 {
        unimplemented!()
    }
}

fn shared_hash(data: &[u8]) -> PoseidonDomain {
    // FIXME: We shouldn't unwrap here, but doing otherwise will require an interface change.
    // We could truncate so `bytes_into_frs` cannot fail, then ensure `data` is always `fr_safe`.
    let preimage = data
        .chunks(32)
        .map(|chunk| {
            Fr::from_repr_vartime(PoseidonDomain::try_from_bytes(chunk).0).expect("from_repr failure")
        })
        .collect::<Vec<_>>();

    shared_hash_frs(&preimage).into()
}

fn shared_hash_frs(preimage: &[Fr]) -> Fr {
    match preimage.len() {
        2 => {
            let mut p = Poseidon::new_with_preimage(preimage, &POSEIDON_CONSTANTS_2);
            p.hash()
        }
        4 => {
            let mut p = Poseidon::new_with_preimage(preimage, &POSEIDON_CONSTANTS_4);
            p.hash()
        }
        8 => {
            let mut p = Poseidon::new_with_preimage(preimage, &POSEIDON_CONSTANTS_8);
            p.hash()
        }
        16 => {
            let mut p = Poseidon::new_with_preimage(preimage, &POSEIDON_CONSTANTS_16);
            p.hash()
        }

        _ => panic_any(format!(
            "Unsupported arity for Poseidon hasher: {}",
            preimage.len()
        )),
    }
}

impl PoseidonFunction {


    fn hash(data: &[u8]) -> PoseidonDomain {
        shared_hash(data)
    }

    fn hash2(a: &PoseidonDomain, b: &PoseidonDomain) -> PoseidonDomain {
        let mut p =
            Poseidon::new_with_preimage(&[(*a).into(), (*b).into()][..], &*POSEIDON_CONSTANTS_2);
        let fr: Fr = p.hash();
        fr.into()
    }

    fn hash_circuit<CS: ConstraintSystem<Fr>>(
        _cs: CS,
        _bits: &[Boolean],
    ) -> Result<AllocatedNum<Fr>, SynthesisError> {
        unimplemented!();
    }

    fn hash2_circuit<CS>(
        cs: CS,
        a: &AllocatedNum<Fr>,
        b: &AllocatedNum<Fr>,
    ) -> Result<AllocatedNum<Fr>, SynthesisError>
    where
        CS: ConstraintSystem<Fr>,
    {
        let preimage = vec![a.clone(), b.clone()];
        poseidon_hash_allocated::<CS, Fr, U2>(cs, preimage, U2::PARAMETERS())
    }
}


impl From<Fr> for PoseidonDomain {
    #[inline]
    fn from(val: Fr) -> Self {
        PoseidonDomain(val.to_repr())
    }
}

impl From<[u8; 32]> for PoseidonDomain {
    #[inline]
    fn from(val: [u8; 32]) -> Self {
        PoseidonDomain(val)
    }
}

impl From<PoseidonDomain> for Fr {
    #[inline]
    fn from(val: PoseidonDomain) -> Self {
        Fr::from_repr_vartime(val.0).expect("from_repr failure")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bellman::gadgets::test::TestConstraintSystem;
    use rand::thread_rng;

    use super::*;
    // use merkletree::{merkle::MerkleTree, store::VecStore};

    fn u64s_to_u8s(u64s: [u64; 4]) -> [u8; 32] {
        let mut bytes = [0u8; 32];
        bytes[..8].copy_from_slice(&u64s[0].to_le_bytes());
        bytes[8..16].copy_from_slice(&u64s[1].to_le_bytes());
        bytes[16..24].copy_from_slice(&u64s[2].to_le_bytes());
        bytes[24..].copy_from_slice(&u64s[3].to_le_bytes());
        bytes
    }

    #[test]
    fn test_hash2_circuit() {
        let mut rng = thread_rng();

        for _ in 0..10 {
            let mut cs = TestConstraintSystem::<Fr>::new();

            let a = Fr::random(&mut rng);
            let b = Fr::random(&mut rng);

            let a_num = {
                let mut cs = cs.namespace(|| "a");
                AllocatedNum::alloc(&mut cs, || Ok(a)).expect("alloc failed")
            };

            let b_num = {
                let mut cs = cs.namespace(|| "b");
                AllocatedNum::alloc(&mut cs, || Ok(b)).expect("alloc failed")
            };

            let out = PoseidonFunction::hash2_circuit(
                cs.namespace(|| "hash2"),
                &a_num,
                &b_num,
            )
            .expect("hash2 function failed");

            assert!(cs.is_satisfied(), "constraints not satisfied");
            // assert_eq!(cs.num_constraints(), 311);

            let expected: Fr = PoseidonFunction::hash2(&a.into(), &b.into()).into();

            assert_eq!(
                expected,
                out.get_value().expect("get_value failed"),
                "circuit and non circuit do not match"
            );
        }
    }

}

