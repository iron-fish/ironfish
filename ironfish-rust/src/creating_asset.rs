use std::slice;

use bellman::groth16;
use bls12_381::Bls12;
use group::Curve;
use rand::rngs::OsRng;
use zcash_primitives::{
    constants::{GH_FIRST_BLOCK, NOTE_COMMITMENT_RANDOMNESS_GENERATOR},
    pedersen_hash,
};

use crate::{
    create_asset_note::CreateAssetNote,
    errors,
    proofs::circuit::create_asset::{self, CreateAsset},
    sapling_bls12::SAPLING,
    SaplingKey,
};

pub struct CreateAssetParams {
    /// Proof that the create asset circuit was valid and successful
    pub(crate) proof: groth16::Proof<Bls12>,

    /// Randomness used to create the identifier commitment
    pub(crate) commitment_randomness: jubjub::Fr,

    // Fields that would exist on "MerkleNote" if we were keeping that pattern:

    // The hash of the note, committing to it's internal state
    pub(crate) create_commitment: bls12_381::Scalar,

    // TODO: Size etc
    pub(crate) encrypted_note: [u8; 12],

    pub(crate) asset_generator: jubjub::ExtendedPoint,
}

impl CreateAssetParams {
    pub(crate) fn new(
        creator_key: &SaplingKey,
        create_asset_note: &CreateAssetNote,
    ) -> Result<CreateAssetParams, errors::SaplingProofError> {
        let asset_info = create_asset_note.asset_info;

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
            commitment_hash + (NOTE_COMMITMENT_RANDOMNESS_GENERATOR * create_asset_note.randomness);

        let commitment = commitment_full_point.to_affine().get_u();

        // Create proof
        let circuit = CreateAsset {
            asset_info: Some(asset_info),
            commitment_randomness: Some(create_asset_note.randomness),
        };
        let proof = groth16::create_random_proof(circuit, &SAPLING.create_asset_params, &mut OsRng)
            .expect("Create valid proof");

        let params = CreateAssetParams {
            proof,
            commitment_randomness: create_asset_note.randomness,
            create_commitment: commitment,
            encrypted_note: [0u8; 12],
            asset_generator: asset_info.asset_type().asset_generator(),
        };

        Ok(params)
    }

    pub fn post(&self) -> Result<CreateAssetProof, errors::SaplingProofError> {
        let create_asset_proof = CreateAssetProof {
            proof: self.proof.clone(),
            create_commitment: self.create_commitment,
            encrypted_note: [0u8; 12],
            asset_generator: self.asset_generator,
        };

        create_asset_proof.verify_proof()?;

        Ok(create_asset_proof)
    }
}

#[derive(Clone)]
pub struct CreateAssetProof {
    pub(crate) proof: groth16::Proof<Bls12>,
    pub(crate) create_commitment: bls12_381::Scalar,
    // TODO: Size made up, copy from CreateAssetParams when changed
    pub(crate) encrypted_note: [u8; 12],
    pub(crate) asset_generator: jubjub::ExtendedPoint,
}

impl CreateAssetProof {
    pub fn verify_proof(&self) -> Result<(), errors::SaplingProofError> {
        let generator_affine = self.asset_generator.to_affine();

        let inputs = [
            generator_affine.get_u(),
            generator_affine.get_v(),
            self.create_commitment,
        ];

        // Verify proof
        groth16::verify_proof(&SAPLING.create_asset_verifying_key, &self.proof, &inputs)
            .expect("Can verify proof");
        Ok(())
    }
}
