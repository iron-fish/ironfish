// TODO: Delete this eventually, this is just for testing reference
use bellman::{
    gadgets::{blake2s, multipack},
    Circuit,
};

use super::sapling::hash_into_boolean_vec_le;

pub struct MyCircuit {
    pub preimage: Option<[u8; 32]>,
}

impl Circuit<bls12_381::Scalar> for MyCircuit {
    fn synthesize<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), bellman::SynthesisError> {
        let preimage_bits = hash_into_boolean_vec_le(
            cs.namespace(|| "booleanize preimage"),
            self.preimage.as_ref(),
        )?;
        assert_eq!(preimage_bits.len(), 32 * 8);

        let hash = blake2s::blake2s(
            cs.namespace(|| "blake2s(preimage)"),
            &preimage_bits,
            &[0; 8],
        )?;

        multipack::pack_into_inputs(cs.namespace(|| "pack hash"), &hash)
    }
}

#[cfg(test)]
mod test {
    use bellman::{gadgets::multipack, groth16};
    use bls12_381::Bls12;
    use rand::rngs::OsRng;

    use super::MyCircuit;

    #[test]
    fn test_my_circuit() {
        // Setup: generate parameters file. This is slow, consider using pre-built ones later
        let params = groth16::generate_random_parameters::<Bls12, _, _>(
            MyCircuit { preimage: None },
            &mut OsRng,
        )
        .expect("Can generate random params");
        let pvk = groth16::prepare_verifying_key(&params.vk);

        let preimage = [5u8; 32];
        let hash = blake2s_simd::Params::new()
            .personal(&[0; 8])
            .hash(&preimage);

        let circuit = MyCircuit {
            preimage: Some(preimage),
        };
        let proof =
            groth16::create_random_proof(circuit, &params, &mut OsRng).expect("Create valid proof");

        let hash_bits = multipack::bytes_to_bits_le(hash.as_bytes());
        let inputs = multipack::compute_multipacking(&hash_bits);

        groth16::verify_proof(&pvk, &proof, &inputs).expect("Can verify proof");
    }
}
