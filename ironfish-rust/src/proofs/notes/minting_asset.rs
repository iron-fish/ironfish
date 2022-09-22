use std::{io, slice};

use bellman::{gadgets::multipack, groth16};
use bls12_381::{Bls12, Scalar};
use byteorder::{LittleEndian, WriteBytesExt};
use ff::PrimeField;
use group::{Curve, GroupEncoding};
use jubjub::ExtendedPoint;
use rand::{rngs::OsRng, thread_rng, Rng};
use zcash_primitives::{constants::NOTE_COMMITMENT_RANDOMNESS_GENERATOR, pedersen_hash};

use crate::{
    errors,
    merkle_note::sapling_auth_path,
    proofs::circuit::mint_asset::MintAsset,
    proofs::notes::mint_asset_note::MintAssetNote,
    sapling_bls12::{self, SAPLING},
    serializing::read_scalar,
    witness::WitnessTrait,
    SaplingKey,
};

pub struct MintAssetParams {
    /// Proof that the mint asset circuit was valid and successful
    pub(crate) proof: groth16::Proof<Bls12>,

    /// Randomness used to mint the identifier commitment
    pub(crate) commitment_randomness: jubjub::Fr,

    // Fields that would exist on "MerkleNote" if we were keeping that pattern:

    // The hash of the note, committing to it's internal state
    pub(crate) mint_commitment: bls12_381::Scalar,

    // TODO: Size etc
    pub(crate) encrypted_note: [u8; 12],

    pub(crate) asset_generator: jubjub::ExtendedPoint,
}

impl MintAssetParams {
    pub(crate) fn new(
        minting_key: &SaplingKey,
        mint_asset_note: &MintAssetNote,
        witness: &dyn WitnessTrait,
    ) -> Result<MintAssetParams, errors::SaplingProofError> {
        let asset_info = mint_asset_note.asset_info;
        let commitment_randomness = mint_asset_note.randomness;
        let value = mint_asset_note.value;
        let commitment = mint_asset_note.commitment();
        let public_address = asset_info.public_address();

        // Calculate the note contents, as bytes
        let mut note_contents = vec![];

        // Write the asset generator, cofactor not cleared
        note_contents.extend(asset_info.asset_type().asset_generator().to_bytes());

        // Writing the value in little endian
        (&mut note_contents)
            .write_u64::<LittleEndian>(value)
            .unwrap();

        // Write g_d
        note_contents.extend_from_slice(&public_address.diversifier_point.to_bytes());

        // Write pk_d
        note_contents.extend_from_slice(&public_address.transmission_key.to_bytes());

        assert_eq!(note_contents.len(), 32 + 32 + 32 + 8);

        let note_hash = jubjub::ExtendedPoint::from(pedersen_hash::pedersen_hash(
            pedersen_hash::Personalization::NoteCommitment,
            note_contents
                .into_iter()
                .flat_map(|byte| (0..8).map(move |i| ((byte >> i) & 1) == 1)),
        ));
        let note_full_point =
            note_hash + (NOTE_COMMITMENT_RANDOMNESS_GENERATOR * commitment_randomness);
        let note_commitment = note_full_point.to_affine().get_u();

        let identifier_bits = multipack::bytes_to_bits_le(asset_info.asset_type().get_identifier());
        let identifier_inputs = multipack::compute_multipacking(&identifier_bits);

        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);
        let randomness = jubjub::Fr::from_bytes_wide(&buffer);
        let value_commitment = asset_info.asset_type().value_commitment(value, randomness);

        let p = ExtendedPoint::from(value_commitment.commitment()).to_affine();
        let mut inputs = vec![Scalar::zero(); 7];
        inputs[0] = identifier_inputs[0];
        inputs[1] = identifier_inputs[1];
        inputs[2] = commitment;
        inputs[3] = witness.root_hash();
        inputs[4] = p.get_u();
        inputs[5] = p.get_v();
        inputs[6] = note_commitment;

        let proof_generation_key = minting_key.sapling_proof_generation_key();
        // Mint proof
        let circuit = MintAsset {
            asset_info: Some(asset_info),
            proof_generation_key: Some(proof_generation_key),
            commitment_randomness: Some(commitment_randomness),
            auth_path: sapling_auth_path(witness),
            anchor: Some(witness.root_hash()),
            value_commitment: Some(value_commitment),
        };
        let proof = groth16::create_random_proof(
            circuit,
            &sapling_bls12::SAPLING.mint_asset_params,
            &mut OsRng,
        )
        .expect("Create valid proof");

        // Verify proof
        groth16::verify_proof(
            &sapling_bls12::SAPLING.mint_asset_verifying_key,
            &proof,
            &inputs[..],
        )
        .expect("Can verify proof");

        let params = MintAssetParams {
            proof,
            commitment_randomness: mint_asset_note.randomness,
            mint_commitment: commitment,
            encrypted_note: [0u8; 12],
            asset_generator: asset_info.asset_type().asset_generator(),
        };

        Ok(params)
    }

    pub fn post(&self) -> Result<MintAssetProof, errors::SaplingProofError> {
        let mint_asset_proof = MintAssetProof {
            proof: self.proof.clone(),
            mint_commitment: self.mint_commitment,
            encrypted_note: [0u8; 12],
            asset_generator: self.asset_generator,
        };

        mint_asset_proof.verify_proof()?;

        Ok(mint_asset_proof)
    }

    pub(crate) fn serialize_signature_fields(&self, mut writer: impl io::Write) -> io::Result<()> {
        self.proof.write(&mut writer)?;
        writer.write_all(&self.mint_commitment.to_repr().as_ref())?;
        writer.write_all(&self.encrypted_note[..])?;
        writer.write_all(&self.asset_generator.to_bytes())?;
        Ok(())
    }
}

#[derive(Clone)]
pub struct MintAssetProof {
    pub(crate) proof: groth16::Proof<Bls12>,
    pub(crate) mint_commitment: bls12_381::Scalar,
    // TODO: Size made up, copy from MintAssetParams when changed
    pub(crate) encrypted_note: [u8; 12],
    pub(crate) asset_generator: jubjub::ExtendedPoint,
}

impl MintAssetProof {
    /// Load a MintAssetProof from a Read implementation( e.g: socket, file)
    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, errors::SaplingProofError> {
        let proof = groth16::Proof::read(&mut reader)?;

        let mint_commitment = read_scalar(&mut reader).map_err(|_| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "Unable to convert note commitment",
            )
        })?;

        let mut encrypted_note = [0; 12];
        reader.read_exact(&mut encrypted_note)?;

        let asset_generator = {
            let mut bytes = [0; 32];
            reader.read_exact(&mut bytes)?;
            let point = ExtendedPoint::from_bytes(&bytes);
            if point.is_none().into() {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "Unable to convert asset generator",
                )
                .into());
            }
            point.unwrap()
        };

        Ok(MintAssetProof {
            proof,
            mint_commitment,
            encrypted_note,
            asset_generator,
        })
    }

    /// Stow the bytes of this CreateAssetProof in the given writer.
    pub fn write<W: io::Write>(&self, writer: W) -> io::Result<()> {
        self.serialize_signature_fields(writer)
    }

    pub fn verify_proof(&self) -> Result<(), errors::SaplingProofError> {
        let generator_affine = self.asset_generator.to_affine();

        let inputs = [
            generator_affine.get_u(),
            generator_affine.get_v(),
            self.mint_commitment,
        ];

        // Verify proof
        groth16::verify_proof(&SAPLING.mint_asset_verifying_key, &self.proof, &inputs)
            .expect("Can verify proof");
        Ok(())
    }

    pub(crate) fn serialize_signature_fields(&self, mut writer: impl io::Write) -> io::Result<()> {
        self.proof.write(&mut writer)?;
        writer.write_all(&self.mint_commitment.to_bytes())?;
        writer.write_all(&self.encrypted_note)?;
        writer.write_all(&self.asset_generator.to_bytes())?;
        Ok(())
    }
}
