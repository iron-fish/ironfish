use bellman::{
    gadgets::{blake2s, boolean},
    Circuit,
};
use ff::PrimeField;
use zcash_primitives::{
    constants,
    primitives::{PaymentAddress, ProofGenerationKey},
};
use zcash_proofs::{
    circuit::ecc,
    constants::{PROOF_GENERATION_KEY_GENERATOR, SPENDING_KEY_GENERATOR},
};

use crate::{
    primitives::sapling::ValueCommitment, proofs::circuit::sapling::slice_into_boolean_vec_le,
    AssetType, PublicAddress,
};

/// Info Needed:
/// - Amount
/// - Identifier
/// - Public Address

pub struct MintAsset {
    // TODO: This will eventually come from asset info, but for now
    // just passing it in so we can do some basic verification
    pub payment_address: Option<PaymentAddress>,
    pub asset_type: Option<AssetType>,
    pub value_commitment: Option<ValueCommitment>,
    pub proof_generation_key: Option<ProofGenerationKey>,
}

impl Circuit<bls12_381::Scalar> for MintAsset {
    fn synthesize<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), bellman::SynthesisError> {
        // Public address validation
        // Prover witnesses ak (ensures that it's on the curve)
        let ak = ecc::EdwardsPoint::witness(
            cs.namespace(|| "ak"),
            self.proof_generation_key.as_ref().map(|k| k.ak.into()),
        )?;

        // There are no sensible attacks on small order points
        // of ak (that we're aware of!) but it's a cheap check,
        // so we do it.
        ak.assert_not_small_order(cs.namespace(|| "ak not small order"))?;

        // // Rerandomize ak and expose it as an input to the circuit
        // {
        //     let ar = boolean::field_into_boolean_vec_le(cs.namespace(|| "ar"), self.ar)?;

        //     // Compute the randomness in the exponent
        //     let ar = ecc::fixed_base_multiplication(
        //         cs.namespace(|| "computation of randomization for the signing key"),
        //         &SPENDING_KEY_GENERATOR,
        //         &ar,
        //     )?;

        //     let rk = ak.add(cs.namespace(|| "computation of rk"), &ar)?;

        //     rk.inputize(cs.namespace(|| "rk"))?;
        // }

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

        // Extend ivk and nf preimages with the representation of
        // nk.
        {
            let repr_nk = nk.repr(cs.namespace(|| "representation of nk"))?;

            ivk_preimage.extend(repr_nk.iter().cloned());
        }

        assert_eq!(ivk_preimage.len(), 512);

        // Compute the incoming viewing key ivk
        let mut ivk = blake2s::blake2s(
            cs.namespace(|| "computation of ivk"),
            &ivk_preimage,
            constants::CRH_IVK_PERSONALIZATION,
        )?;

        // drop_5 to ensure it's in the field
        ivk.truncate(jubjub::Fr::CAPACITY as usize);

        let d_bits = slice_into_boolean_vec_le(
            cs.namespace(|| "d bits"),
            self.payment_address
                .as_ref()
                .and_then(|a| a.diversifier().0.as_ref().into()),
            11 * 8,
        )?;

        // Calculate g_d from ivk
        let mut g_d = blake2s::blake2s(
            cs.namespace(|| "computation of g_d"),
            &d_bits,
            constants::KEY_DIVERSIFICATION_PERSONALIZATION,
        )?;

        // Witness g_d, checking that it's on the curve.
        let g_d = {
            ecc::EdwardsPoint::witness(
                cs.namespace(|| "witness g_d"),
                self.payment_address
                    .as_ref()
                    .and_then(|a| a.g_d().map(jubjub::ExtendedPoint::from)),
            )?
        };

        // Check that g_d is not small order. Technically, this check
        // is already done in the Output circuit, and this proof ensures
        // g_d is bound to a product of that check, but for defense in
        // depth let's check it anyway. It's cheap.
        g_d.assert_not_small_order(cs.namespace(|| "g_d not small order"))?;

        // Compute pk_d = g_d^ivk
        let pk_d = g_d.mul(cs.namespace(|| "compute pk_d"), &ivk)?;

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use bellman::groth16;
    use bls12_381::Bls12;
    use group::Curve;
    use rand::rngs::OsRng;

    use crate::{primitives::asset_type::AssetInfo, SaplingKey};

    use super::MintAsset;

    #[test]
    fn test_mint_asset_circuit() {
        // Setup: generate parameters file. This is slow, consider using pre-built ones later
        let params = groth16::generate_random_parameters::<Bls12, _, _>(
            MintAsset {
                payment_address: todo!(),
                asset_type: todo!(),
                value_commitment: todo!(),
                proof_generation_key: todo!(),
            },
            &mut OsRng,
        )
        .expect("Can generate random params");
        let pvk = groth16::prepare_verifying_key(&params.vk);

        // Test setup: create sapling keys
        let sapling_key = SaplingKey::generate_key();
        let public_address = sapling_key.generate_public_address();

        // Test setup: create an Asset Type
        let name = "My custom asset 1";
        let asset_info = AssetInfo::new(name, public_address).expect("Can create a valid asset");

        // let generator_affine = asset_info.asset_type().asset_generator().to_affine();
        // let inputs = [generator_affine.get_u(), generator_affine.get_v()];
        let inputs = vec![];

        // Create proof
        let circuit = MintAsset {
            payment_address: todo!(),
            asset_type: todo!(),
            value_commitment: todo!(),
            proof_generation_key: todo!(),
        };
        let proof =
            groth16::create_random_proof(circuit, &params, &mut OsRng).expect("Create valid proof");

        // Verify proof
        groth16::verify_proof(&pvk, &proof, &inputs).expect("Can verify proof");

        // Sanity check that this fails with different inputs
        let bad_name = "My custom asset 2";
        let bad_asset_info =
            AssetInfo::new(bad_name, public_address).expect("Can create a valid asset");

        let bad_generator_affine = bad_asset_info.asset_type().asset_generator().to_affine();
        let bad_inputs = [bad_generator_affine.get_u(), bad_generator_affine.get_v()];

        assert!(groth16::verify_proof(&pvk, &proof, &bad_inputs).is_err());
    }
}
