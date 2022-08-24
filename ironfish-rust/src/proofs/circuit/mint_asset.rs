use std::slice;

use bellman::{
    gadgets::{blake2s, boolean, multipack},
    Circuit,
};
use ff::PrimeField;
use zcash_primitives::{
    constants::{self, GH_FIRST_BLOCK},
    primitives::{PaymentAddress, ProofGenerationKey},
};
use zcash_proofs::{
    circuit::{ecc, pedersen_hash},
    constants::{PROOF_GENERATION_KEY_GENERATOR, SPENDING_KEY_GENERATOR},
};

use crate::{
    primitives::{
        asset_type::AssetInfo, constants::ASSET_IDENTIFIER_PERSONALIZATION,
        sapling::ValueCommitment,
    },
    proofs::circuit::sapling::slice_into_boolean_vec_le,
    AssetType, PublicAddress,
};

/// Info Needed:
/// - Amount
/// - Identifier
/// - Public Address

pub struct MintAsset {
    pub asset_info: Option<AssetInfo>,
    pub proof_generation_key: Option<ProofGenerationKey>,
}

impl Circuit<bls12_381::Scalar> for MintAsset {
    fn synthesize<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), bellman::SynthesisError> {
        // Asset Commitment Contents
        let mut asset_commitment_contents = vec![];

        // TODO: I wonder if we could hard-code this to minimize work?
        // Not clear to me if the booleanizing is adding substantial time
        // or if it's just a by-product of the hash taking longer due to
        // more input. Also not clear if that has security implications
        // by not witnessing the bits
        let first_block_bits = slice_into_boolean_vec_le(
            cs.namespace(|| "booleanize first block"),
            Some(GH_FIRST_BLOCK),
            64 * 8,
        )?;

        assert_eq!(first_block_bits.len(), 64 * 8);

        let name_bits = slice_into_boolean_vec_le(
            cs.namespace(|| "booleanize asset info name"),
            self.asset_info.as_ref().and_then(|i| i.name().into()),
            32 * 8,
        )?;

        let public_address_bits = slice_into_boolean_vec_le(
            cs.namespace(|| "booleanize asset info public address"),
            self.asset_info
                .as_ref()
                .and_then(|i| i.public_address_bytes().into()),
            43 * 8,
        )?;

        let nonce_bits = slice_into_boolean_vec_le(
            cs.namespace(|| "booleanize asset info nonce"),
            self.asset_info
                .as_ref()
                .and_then(|i| slice::from_ref(i.nonce()).into()),
            8,
        )?;

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

        // Witness g_d, checking that it's on the curve.
        let g_d = {
            ecc::EdwardsPoint::witness(
                cs.namespace(|| "witness g_d"),
                self.asset_info.as_ref().and_then(|a| {
                    jubjub::ExtendedPoint::from(a.public_address().diversifier_point).into()
                }),
            )?
        };

        // Check that g_d is not small order. Technically, this check
        // is already done in the Output circuit, and this proof ensures
        // g_d is bound to a product of that check, but for defense in
        // depth let's check it anyway. It's cheap.
        g_d.assert_not_small_order(cs.namespace(|| "g_d not small order"))?;

        // Compute pk_d = g_d^ivk
        let pk_d = g_d.mul(cs.namespace(|| "compute pk_d"), &ivk)?;

        let calculated_pk_d_bits = pk_d.repr(cs.namespace(|| "representation of pk_d"))?;
        let asset_pk_d_bits = &public_address_bits[88..];

        for i in 0..256 {
            boolean::Boolean::enforce_equal(
                cs.namespace(|| format!("integrity of asset generator bit {}", i)),
                &asset_pk_d_bits[i],
                &calculated_pk_d_bits[i],
            )?;
        }

        asset_commitment_contents.extend(first_block_bits);
        asset_commitment_contents.extend(name_bits);
        asset_commitment_contents.extend(public_address_bits);
        asset_commitment_contents.extend(nonce_bits);

        let asset_identifier = blake2s::blake2s(
            cs.namespace(|| "blake2s(asset info)"),
            &asset_commitment_contents,
            ASSET_IDENTIFIER_PERSONALIZATION,
        )?;

        multipack::pack_into_inputs(cs.namespace(|| "pack hash"), &asset_identifier)?;

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use std::slice;

    use bellman::{gadgets::multipack, groth16};
    use bls12_381::Bls12;
    use group::Curve;
    use jubjub::ExtendedPoint;
    use rand::rngs::OsRng;
    use zcash_primitives::pedersen_hash;

    use crate::{primitives::asset_type::AssetInfo, SaplingKey};

    use super::MintAsset;

    #[test]
    fn test_mint_asset_circuit() {
        // Setup: generate parameters file. This is slow, consider using pre-built ones later
        let params = groth16::generate_random_parameters::<Bls12, _, _>(
            MintAsset {
                asset_info: None,
                proof_generation_key: None,
            },
            &mut OsRng,
        )
        .expect("Can generate random params");
        let pvk = groth16::prepare_verifying_key(&params.vk);

        // Test setup: create sapling keys
        let sapling_key = SaplingKey::generate_key();
        let public_address = sapling_key.generate_public_address();
        let proof_generation_key = sapling_key.sapling_proof_generation_key();

        // Test setup: create an Asset Type
        let name = "My custom asset 1";
        let asset_info =
            AssetInfo::new(name, public_address.clone()).expect("Can create a valid asset");

        let identifier_bits = multipack::bytes_to_bits_le(asset_info.asset_type().get_identifier());
        let inputs = multipack::compute_multipacking(&identifier_bits);

        // Create proof
        let circuit = MintAsset {
            asset_info: Some(asset_info),
            proof_generation_key: Some(proof_generation_key),
        };
        let proof =
            groth16::create_random_proof(circuit, &params, &mut OsRng).expect("Create valid proof");

        // Verify proof
        groth16::verify_proof(&pvk, &proof, &inputs).expect("Can verify proof");

        // Sanity check that this fails with different inputs
        let bad_name = "My custom asset 2";
        let bad_asset_info =
            AssetInfo::new(bad_name, public_address).expect("Can create a valid asset");

        let bad_identifier_bits =
            multipack::bytes_to_bits_le(bad_asset_info.asset_type().get_identifier());
        let bad_inputs = multipack::compute_multipacking(&bad_identifier_bits);

        assert!(groth16::verify_proof(&pvk, &proof, &bad_inputs).is_err());
    }
}
