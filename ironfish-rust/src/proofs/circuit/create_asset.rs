use bellman::{
    gadgets::{blake2s, boolean},
    Circuit,
};
use zcash_primitives::constants::VALUE_COMMITMENT_GENERATOR_PERSONALIZATION;
use zcash_proofs::{
    circuit::{ecc, pedersen_hash},
    constants::NOTE_COMMITMENT_RANDOMNESS_GENERATOR,
};

use crate::{
    primitives::{asset_type::AssetInfo, constants::ASSET_IDENTIFIER_PERSONALIZATION},
    proofs::circuit::util::hash_asset_info_to_preimage,
};

pub struct CreateAsset {
    pub asset_info: Option<AssetInfo>,

    pub commitment_randomness: Option<jubjub::Fr>,
}

impl Circuit<bls12_381::Scalar> for CreateAsset {
    fn synthesize<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), bellman::SynthesisError> {
        // Hash the Asset Info pre-image
        let combined_preimage = hash_asset_info_to_preimage(
            &mut cs.namespace(|| "asset info preimage"),
            self.asset_info,
        )?;

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

        // TODO: Create an Asset Note concept instead of using Asset Info
        // TODO: does this need a different personalization
        let mut cm = pedersen_hash::pedersen_hash(
            cs.namespace(|| "asset note content hash"),
            pedersen_hash::Personalization::NoteCommitment,
            &combined_preimage,
        )?;

        {
            // Booleanize the randomness
            let rcm = boolean::field_into_boolean_vec_le(
                cs.namespace(|| "rcm"),
                self.commitment_randomness,
            )?;

            // Compute the note commitment randomness in the exponent
            let rcm = ecc::fixed_base_multiplication(
                cs.namespace(|| "computation of commitment randomness"),
                &NOTE_COMMITMENT_RANDOMNESS_GENERATOR,
                &rcm,
            )?;

            // Randomize our note commitment
            cm = cm.add(cs.namespace(|| "randomization of note commitment"), &rcm)?;
        }

        cm.get_u().inputize(cs.namespace(|| "commitment"))?;

        // Note to selves: Create Asset circuit is going to be basically identical to Output circuit
        // with proving you own the public key in Asset Info

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use std::slice;

    use bellman::groth16;
    use bls12_381::Bls12;
    use group::Curve;
    use rand::{rngs::OsRng, Rng};
    use zcash_primitives::{
        constants::{GH_FIRST_BLOCK, NOTE_COMMITMENT_RANDOMNESS_GENERATOR},
        pedersen_hash::{self},
    };

    use crate::{
        create_asset_note::CreateAssetNote, note::Memo, primitives::asset_type::AssetInfo,
        sapling_bls12, test_util::make_fake_witness, AssetType, Note, ProposedTransaction,
        SaplingKey,
    };

    use super::CreateAsset;

    #[test]
    fn test_create_asset_circuit() {
        // Setup: generate parameters file. This is slow, consider using pre-built ones later
        let params = groth16::generate_random_parameters::<Bls12, _, _>(
            CreateAsset {
                asset_info: None,
                commitment_randomness: None,
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
        let asset_info =
            AssetInfo::new(name, public_address.clone()).expect("Can create a valid asset");

        let generator_affine = asset_info.asset_type().asset_generator().to_affine();

        let commitment_randomness = {
            let mut buffer = [0u8; 64];
            OsRng.fill(&mut buffer[..]);

            jubjub::Fr::from_bytes_wide(&buffer)
        };

        let mut commitment_plaintext: Vec<u8> = vec![];
        commitment_plaintext.extend(GH_FIRST_BLOCK);
        commitment_plaintext.extend(asset_info.name());
        commitment_plaintext.extend(asset_info.public_address_bytes());
        commitment_plaintext.extend(slice::from_ref(asset_info.nonce()));

        // TODO: Make a helper function
        let commitment_hash = jubjub::ExtendedPoint::from(pedersen_hash::pedersen_hash(
            pedersen_hash::Personalization::NoteCommitment,
            commitment_plaintext
                .into_iter()
                .flat_map(|byte| (0..8).map(move |i| ((byte >> i) & 1) == 1)),
        ));

        let commitment_full_point =
            commitment_hash + (NOTE_COMMITMENT_RANDOMNESS_GENERATOR * commitment_randomness);

        let commitment = commitment_full_point.to_affine().get_u();

        let inputs = [
            generator_affine.get_u(),
            generator_affine.get_v(),
            commitment,
        ];

        // Create proof
        let circuit = CreateAsset {
            asset_info: Some(asset_info),
            commitment_randomness: Some(commitment_randomness),
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
        let bad_inputs = [
            bad_generator_affine.get_u(),
            bad_generator_affine.get_v(),
            commitment,
        ];

        assert!(groth16::verify_proof(&pvk, &proof, &bad_inputs).is_err());

        // Sanity check that this fails with different public address
        let bad_sapling_key = SaplingKey::generate_key();
        let bad_public_address = bad_sapling_key.generate_public_address();

        let bad_asset_info =
            AssetInfo::new(name, bad_public_address).expect("Can create a valid asset");

        let bad_generator_affine = bad_asset_info.asset_type().asset_generator().to_affine();
        let bad_inputs = [
            bad_generator_affine.get_u(),
            bad_generator_affine.get_v(),
            commitment,
        ];

        assert!(groth16::verify_proof(&pvk, &proof, &bad_inputs).is_err());

        // TODO: Add a sanity check with a bad commitment
    }

    #[test]
    fn test_proper_create_asset_circuit() {
        let sapling = sapling_bls12::SAPLING.clone();

        // Setup: generate parameters file. This is slow, consider using pre-built ones later
        let params = groth16::generate_random_parameters::<Bls12, _, _>(
            CreateAsset {
                asset_info: None,
                commitment_randomness: None,
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
        let asset_info =
            AssetInfo::new(name, public_address.clone()).expect("Can create a valid asset");

        // Create asset note
        let note = CreateAssetNote::new(asset_info);

        // Regular spend note for transaction fee
        let in_note = Note::new(public_address, 1, Memo::default(), AssetType::default());
        let witness = make_fake_witness(&in_note);

        let mut transaction = ProposedTransaction::new(sapling);
        transaction
            .spend(sapling_key.clone(), &in_note, &witness)
            .expect("Can add spend for tx fee");
        transaction
            .create_asset(&sapling_key, &note)
            .expect("Can add create asset note");

        // TODO:
        // - transaction.post
        // - transaction.verify
    }
}
