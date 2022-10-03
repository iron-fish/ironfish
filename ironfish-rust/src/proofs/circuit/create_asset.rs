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

    pub create_commitment_randomness: Option<jubjub::Fr>,
}

impl Circuit<bls12_381::Scalar> for CreateAsset {
    fn synthesize<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), bellman::SynthesisError> {
        // Hash the Asset Info pre-image
        let identifier_preimage = hash_asset_info_to_preimage(
            &mut cs.namespace(|| "asset info preimage"),
            self.asset_info,
        )?;

        // Computed identifier bits from the given asset info
        let asset_identifier = blake2s::blake2s(
            cs.namespace(|| "blake2s(asset info)"),
            &identifier_preimage,
            ASSET_IDENTIFIER_PERSONALIZATION, // TODO: Another candidate for hard-coding the bits
        )?;

        // Ensure the pre-image of the generator is 32 bytes
        assert_eq!(asset_identifier.len(), 256);

        // The asset generator computed in the circuit
        let hashed_asset_generator_bits = blake2s::blake2s(
            cs.namespace(|| "blake2s(asset identifier)"),
            &asset_identifier,
            VALUE_COMMITMENT_GENERATOR_PERSONALIZATION,
        )?;

        // Witnessing this edwards point proves it's a valid point on the curve
        // using the generator point passed in as a circuit parameter
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
                &hashed_asset_generator_bits[i],
                &provided_asset_generator_bits[i],
            )?;
        }

        // TODO: Create an Asset Note concept instead of using Asset Info
        // TODO: does this need a different personalization
        let mut commitment = pedersen_hash::pedersen_hash(
            cs.namespace(|| "asset note content hash"),
            pedersen_hash::Personalization::NoteCommitment,
            &identifier_preimage,
        )?;

        {
            // Booleanize the randomness
            let randomness_bits = boolean::field_into_boolean_vec_le(
                cs.namespace(|| "rcm"),
                self.create_commitment_randomness,
            )?;

            // Compute the note commitment randomness in the exponent
            let commitment_randomness = ecc::fixed_base_multiplication(
                cs.namespace(|| "computation of commitment randomness"),
                &NOTE_COMMITMENT_RANDOMNESS_GENERATOR,
                &randomness_bits,
            )?;

            // Randomize our note commitment
            commitment = commitment.add(
                cs.namespace(|| "randomization of note commitment"),
                &commitment_randomness,
            )?;
        }

        commitment.get_u().inputize(cs.namespace(|| "commitment"))?;

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
        sapling::pedersen_hash,
    };

    use crate::{
        note::Memo, primitives::asset_type::AssetInfo,
        proofs::notes::create_asset_note::CreateAssetNote, sapling_bls12,
        test_util::make_fake_witness, AssetType, Note, ProposedTransaction, SaplingKey,
    };

    use super::CreateAsset;

    #[test]
    fn test_create_asset_circuit() {
        // Setup: generate parameters file. This is slow, consider using pre-built ones later
        let params = groth16::generate_random_parameters::<Bls12, _, _>(
            CreateAsset {
                asset_info: None,
                create_commitment_randomness: None,
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

        let generator_affine = asset_info.asset_type().asset_generator().to_affine();

        let create_commitment_randomness = {
            let mut buffer = [0u8; 64];
            OsRng.fill(&mut buffer[..]);

            jubjub::Fr::from_bytes_wide(&buffer)
        };

        let mut create_commitment_plaintext: Vec<u8> = vec![];
        create_commitment_plaintext.extend(GH_FIRST_BLOCK);
        create_commitment_plaintext.extend(asset_info.name());
        create_commitment_plaintext.extend(asset_info.public_address_bytes());
        create_commitment_plaintext.extend(slice::from_ref(asset_info.nonce()));

        // TODO: Make a helper function
        let create_commitment_hash = jubjub::ExtendedPoint::from(pedersen_hash::pedersen_hash(
            pedersen_hash::Personalization::NoteCommitment,
            create_commitment_plaintext
                .into_iter()
                .flat_map(|byte| (0..8).map(move |i| ((byte >> i) & 1) == 1)),
        ));

        let create_commitment_full_point = create_commitment_hash
            + (NOTE_COMMITMENT_RANDOMNESS_GENERATOR * create_commitment_randomness);

        let create_commitment = create_commitment_full_point.to_affine().get_u();

        let public_inputs = [
            generator_affine.get_u(),
            generator_affine.get_v(),
            create_commitment,
        ];

        // Create proof
        let circuit = CreateAsset {
            asset_info: Some(asset_info),
            create_commitment_randomness: Some(create_commitment_randomness),
        };
        let proof =
            groth16::create_random_proof(circuit, &params, &mut OsRng).expect("Create valid proof");

        // Verify proof
        groth16::verify_proof(&pvk, &proof, &public_inputs).expect("Can verify proof");

        // Sanity check that this fails with different asset name
        let bad_name = "My custom asset 2";
        let bad_asset_info =
            AssetInfo::new(bad_name, public_address).expect("Can create a valid asset");

        let bad_generator_affine = bad_asset_info.asset_type().asset_generator().to_affine();
        let bad_inputs = [
            bad_generator_affine.get_u(),
            bad_generator_affine.get_v(),
            create_commitment,
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
            create_commitment,
        ];

        assert!(groth16::verify_proof(&pvk, &proof, &bad_inputs).is_err());

        // TODO: Add a sanity check with a bad commitment
    }

    #[test]
    fn test_proper_create_asset_circuit() {
        let sapling = sapling_bls12::SAPLING.clone();

        // Test setup: create sapling keys
        let sapling_key = SaplingKey::generate_key();
        let public_address = sapling_key.generate_public_address();

        // Test setup: create an Asset Type
        let name = "My custom asset 1";
        let asset_info = AssetInfo::new(name, public_address).expect("Can create a valid asset");

        // Create asset note
        let create_note = CreateAssetNote::new(asset_info);

        let tx_fee = 1;

        // Regular spend note for transaction fee
        let in_note = Note::new(
            public_address,
            tx_fee,
            Memo::default(),
            AssetType::default(),
        );
        let note_witness = make_fake_witness(&in_note);

        let mut transaction = ProposedTransaction::new();
        transaction
            .spend(sapling_key.clone(), &in_note, &note_witness)
            .expect("Can add spend for tx fee");
        transaction
            .create_asset(&sapling_key, &create_note)
            .expect("Can add create asset note");

        let public_transaction = transaction
            .post(&sapling_key, None, tx_fee)
            .expect("should be able to post transaction");

        public_transaction
            .verify()
            .expect("should be able to verify transaction");

        // TODO: .transaction_fee() is a different time from the 3rd argument of .post
        // These need to be the same, whichever makes sense
        assert_eq!(public_transaction.transaction_fee(), tx_fee as i64);
    }
}
