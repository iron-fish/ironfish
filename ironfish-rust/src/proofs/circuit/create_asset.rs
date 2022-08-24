use std::slice;

use bellman::{
    gadgets::{blake2s, boolean},
    Circuit,
};
use zcash_primitives::constants::{GH_FIRST_BLOCK, VALUE_COMMITMENT_GENERATOR_PERSONALIZATION};
use zcash_proofs::circuit::ecc;

use crate::primitives::{asset_type::AssetInfo, constants::ASSET_IDENTIFIER_PERSONALIZATION};

use super::sapling::slice_into_boolean_vec_le;

pub struct CreateAsset {
    pub asset_info: Option<AssetInfo>,
}

impl Circuit<bls12_381::Scalar> for CreateAsset {
    fn synthesize<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), bellman::SynthesisError> {
        // Hash the Asset Info pre-image
        let mut combined_preimage = vec![];

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

        combined_preimage.extend(first_block_bits);

        let name_bits = slice_into_boolean_vec_le(
            cs.namespace(|| "booleanize name"),
            self.asset_info.as_ref().and_then(|i| i.name().into()),
            32 * 8,
        )?;

        assert_eq!(name_bits.len(), 32 * 8);

        combined_preimage.extend(name_bits);

        let public_address_bits = slice_into_boolean_vec_le(
            cs.namespace(|| "booleanize public address"),
            self.asset_info
                .as_ref()
                .and_then(|i| i.public_address_bytes().into()),
            43 * 8,
        )?;

        assert_eq!(public_address_bits.len(), 43 * 8);

        combined_preimage.extend(public_address_bits);

        let nonce_bits = slice_into_boolean_vec_le(
            cs.namespace(|| "booleanize nonce"),
            self.asset_info
                .as_ref()
                .and_then(|i| slice::from_ref(i.nonce()).into()),
            8,
        )?;

        assert_eq!(nonce_bits.len(), 8);

        combined_preimage.extend(nonce_bits);

        // Computed identifier bits from the given asset info
        let asset_identifier = blake2s::blake2s(
            cs.namespace(|| "blake2s(asset info)"),
            &combined_preimage,
            ASSET_IDENTIFIER_PERSONALIZATION, // TODO: Another candidate for hard-coding the bits
        )?;

        // Ensure the pre-image of the generator is 32 bytes
        assert_eq!(asset_identifier.len(), 256);

        let computed_asset_generator_bits = blake2s::blake2s(
            cs.namespace(|| "blake2s(asset identifier)"),
            &asset_identifier,
            VALUE_COMMITMENT_GENERATOR_PERSONALIZATION,
        )?;

        // Witnessing this edwards point proves it's a valid point on the curve
        let provided_asset_generator = ecc::EdwardsPoint::witness(
            cs.namespace(|| "witness asset generator"),
            self.asset_info
                .as_ref()
                .and_then(|ai| ai.asset_type().asset_generator().into()),
        )?;

        // Make the asset generator a public input
        provided_asset_generator.inputize(cs.namespace(|| "inputize asset generator"))?;

        let provided_asset_generator_bits =
            provided_asset_generator.repr(cs.namespace(|| "unpack provided asset generator"))?;

        // TODO: This is copied from sapling output circuit and I'm pretty sure there's
        // a zcash or bellman fn that does this
        // --
        // Check integrity of the asset generator
        // The following 256 constraints may not be strictly
        // necessary; the output of the BLAKE2s hash may be
        // interpreted directly as a curve point instead
        // However, witnessing the asset generator separately
        // and checking equality to the image of the hash
        // is conceptually clear and not particularly expensive
        for i in 0..256 {
            boolean::Boolean::enforce_equal(
                cs.namespace(|| format!("integrity of asset generator bit {}", i)),
                &computed_asset_generator_bits[i],
                &provided_asset_generator_bits[i],
            )?;
        }
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

    use super::CreateAsset;

    #[test]
    fn test_create_asset_circuit() {
        // Setup: generate parameters file. This is slow, consider using pre-built ones later
        let params = groth16::generate_random_parameters::<Bls12, _, _>(
            CreateAsset { asset_info: None },
            &mut OsRng,
        )
        .expect("Can generate random params");
        let pvk = groth16::prepare_verifying_key(&params.vk);

        // Test setup: create sapling keys
        let sapling_key = SaplingKey::generate_key();
        let public_address = sapling_key.generate_public_address();

        // Test setup: create an Asset Type
        let name = "My custom asset 1";
        let asset_info =
            AssetInfo::new(name, public_address.clone()).expect("Can create a valid asset");

        let generator_affine = asset_info.asset_type().asset_generator().to_affine();
        let inputs = [generator_affine.get_u(), generator_affine.get_v()];

        // Create proof
        let circuit = CreateAsset {
            asset_info: Some(asset_info),
        };
        let proof =
            groth16::create_random_proof(circuit, &params, &mut OsRng).expect("Create valid proof");

        // Verify proof
        groth16::verify_proof(&pvk, &proof, &inputs).expect("Can verify proof");

        // Sanity check that this fails with different asset name
        let bad_name = "My custom asset 2";
        let bad_asset_info =
            AssetInfo::new(bad_name, public_address).expect("Can create a valid asset");

        let bad_generator_affine = bad_asset_info.asset_type().asset_generator().to_affine();
        let bad_inputs = [bad_generator_affine.get_u(), bad_generator_affine.get_v()];

        assert!(groth16::verify_proof(&pvk, &proof, &bad_inputs).is_err());

        // Sanity check that this fails with different public address
        let bad_sapling_key = SaplingKey::generate_key();
        let bad_public_address = bad_sapling_key.generate_public_address();

        let bad_asset_info =
            AssetInfo::new(name, bad_public_address).expect("Can create a valid asset");

        let bad_generator_affine = bad_asset_info.asset_type().asset_generator().to_affine();
        let bad_inputs = [bad_generator_affine.get_u(), bad_generator_affine.get_v()];

        assert!(groth16::verify_proof(&pvk, &proof, &bad_inputs).is_err());
    }
}
