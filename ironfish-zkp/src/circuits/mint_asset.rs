use bellman::{
    gadgets::{blake2s, boolean},
    Circuit,
};
use ff::PrimeField;
use zcash_primitives::sapling::ProofGenerationKey;
use zcash_proofs::{
    circuit::ecc,
    constants::{PROOF_GENERATION_KEY_GENERATOR, SPENDING_KEY_GENERATOR},
};

use crate::constants::{proof::PUBLIC_KEY_GENERATOR, CRH_IVK_PERSONALIZATION};

pub struct MintAsset {
    /// Key required to construct proofs for a particular spending key
    pub proof_generation_key: Option<ProofGenerationKey>,

    /// Used to add randomness to signature generation without leaking the
    /// key. Referred to as `ar` in the literature.
    pub public_key_randomness: Option<jubjub::Fr>,
}

impl Circuit<bls12_381::Scalar> for MintAsset {
    fn synthesize<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), bellman::SynthesisError> {
        // Prover witnesses ak (ensures that it's on the curve)
        let ak = ecc::EdwardsPoint::witness(
            cs.namespace(|| "ak"),
            self.proof_generation_key.as_ref().map(|k| k.ak.into()),
        )?;

        // There are no sensible attacks on small order points
        // of ak (that we're aware of!) but it's a cheap check,
        // so we do it.
        ak.assert_not_small_order(cs.namespace(|| "ak not small order"))?;

        // Rerandomize ak and expose it as an input to the circuit
        {
            let ar = boolean::field_into_boolean_vec_le(
                cs.namespace(|| "ar"),
                self.public_key_randomness,
            )?;

            // Compute the randomness in the exponent
            let ar = ecc::fixed_base_multiplication(
                cs.namespace(|| "computation of randomization for the signing key"),
                &SPENDING_KEY_GENERATOR,
                &ar,
            )?;

            let rk = ak.add(cs.namespace(|| "computation of rk"), &ar)?;

            rk.inputize(cs.namespace(|| "rk"))?;
        }

        // Compute nk = [nsk] ProofGenerationKey
        let nk;
        {
            // Witness nsk as bits
            let nsk = boolean::field_into_boolean_vec_le(
                cs.namespace(|| "nsk"),
                self.proof_generation_key.as_ref().map(|k| k.nsk),
            )?;

            // NB: We don't ensure that the bit representation of nsk
            // is "in the field" (jubjub::Fr) because it's not used
            // except to demonstrate the prover knows it. If they know
            // a congruency then that's equivalent.

            // Compute nk = [nsk] ProvingPublicKey
            nk = ecc::fixed_base_multiplication(
                cs.namespace(|| "computation of nk"),
                &PROOF_GENERATION_KEY_GENERATOR,
                &nsk,
            )?;
        }

        // This is the "viewing key" preimage for CRH^ivk
        let mut ivk_preimage = vec![];

        // Place ak in the preimage for CRH^ivk
        ivk_preimage.extend(ak.repr(cs.namespace(|| "representation of ak"))?);

        // Extend ivk preimage with the representation of nk.
        {
            let repr_nk = nk.repr(cs.namespace(|| "representation of nk"))?;

            ivk_preimage.extend(repr_nk.iter().cloned());
        }

        assert_eq!(ivk_preimage.len(), 512);

        // Compute the incoming viewing key ivk
        let mut ivk = blake2s::blake2s(
            cs.namespace(|| "computation of ivk"),
            &ivk_preimage,
            CRH_IVK_PERSONALIZATION,
        )?;

        // drop_5 to ensure it's in the field
        ivk.truncate(jubjub::Fr::CAPACITY as usize);

        // Compute owner public address
        let owner_public_address = ecc::fixed_base_multiplication(
            cs.namespace(|| "compute pk_d"),
            &PUBLIC_KEY_GENERATOR,
            &ivk,
        )?;

        owner_public_address.inputize(cs.namespace(|| "owner public address"))?;

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use bellman::{gadgets::test::TestConstraintSystem, Circuit};
    use ff::Field;
    use group::{Curve, Group};
    use jubjub::ExtendedPoint;
    use rand::{rngs::StdRng, SeedableRng};
    use zcash_primitives::sapling::ProofGenerationKey;

    use crate::constants::PUBLIC_KEY_GENERATOR;

    use super::MintAsset;

    #[test]
    fn test_mint_asset_circuit() {
        // Seed a fixed rng for determinism in the test
        let mut rng = StdRng::seed_from_u64(0);

        let mut cs = TestConstraintSystem::new();

        let proof_generation_key = ProofGenerationKey {
            ak: jubjub::SubgroupPoint::random(&mut rng),
            nsk: jubjub::Fr::random(&mut rng),
        };
        let incoming_view_key = proof_generation_key.to_viewing_key();
        let public_address = PUBLIC_KEY_GENERATOR * incoming_view_key.ivk().0;
        let public_address_point = ExtendedPoint::from(public_address).to_affine();

        let public_key_randomness = jubjub::Fr::random(&mut rng);
        let randomized_public_key =
            ExtendedPoint::from(incoming_view_key.rk(public_key_randomness)).to_affine();

        let public_inputs = vec![
            randomized_public_key.get_u(),
            randomized_public_key.get_v(),
            public_address_point.get_u(),
            public_address_point.get_v(),
        ];

        // Mint proof
        let circuit = MintAsset {
            proof_generation_key: Some(proof_generation_key),
            public_key_randomness: Some(public_key_randomness),
        };
        circuit.synthesize(&mut cs).unwrap();

        assert!(cs.is_satisfied());
        assert!(cs.verify(&public_inputs));
        assert_eq!(cs.num_constraints(), 25341);

        // Bad randomized public key
        let bad_randomized_public_key_point = ExtendedPoint::random(&mut rng).to_affine();
        let mut bad_inputs = public_inputs.clone();
        bad_inputs[0] = bad_randomized_public_key_point.get_u();

        assert!(!cs.verify(&bad_inputs));

        // Bad public address
        let bad_public_address = ExtendedPoint::random(&mut rng).to_affine();
        let mut bad_inputs = public_inputs.clone();
        bad_inputs[2] = bad_public_address.get_u();

        // Sanity check
        assert!(cs.verify(&public_inputs));
    }
}
