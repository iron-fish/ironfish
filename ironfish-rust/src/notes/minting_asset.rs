use std::io;

use bellman::{gadgets::multipack, groth16};
use bls12_381::{Bls12, Scalar};
use group::Curve;
use rand::{rngs::OsRng, thread_rng, Rng};

use crate::{
    errors,
    merkle_note::sapling_auth_path,
    notes::note::Note,
    primitives::{asset_type::AssetIdentifier, constants::ASSET_IDENTIFIER_LENGTH},
    proofs::circuit::mint_asset::MintAsset,
    sapling_bls12::{self},
    serializing::read_scalar,
    witness::WitnessTrait,
    AssetType, MerkleNote, SaplingKey,
};

use super::create_asset_note::CreateAssetNote;

pub struct MintAssetParams {
    /// Proof that the mint asset circuit was valid and successful
    pub(crate) proof: groth16::Proof<Bls12>,

    /// Randomness used to mint the identifier commitment
    pub(crate) _mint_commitment_randomness: jubjub::Fr,

    // Fields that would exist on "MerkleNote" if we were keeping that pattern:

    // The hash of the note, committing to it's internal state
    pub(crate) create_asset_commitment: bls12_381::Scalar,

    pub(crate) asset_type: AssetType,

    pub(crate) root_hash: bls12_381::Scalar,

    pub(crate) merkle_note: MerkleNote,
}

impl MintAssetParams {
    pub(crate) fn new(
        minting_key: &SaplingKey,
        create_asset_note: &CreateAssetNote,
        mint_asset_note: &Note,
        create_asset_note_witness: &dyn WitnessTrait,
    ) -> Result<MintAssetParams, errors::SaplingProofError> {
        let asset_info = create_asset_note.asset_info;
        let create_commitment_randomness = create_asset_note.randomness;
        let mint_commitment_randomness = mint_asset_note.randomness;

        let create_asset_commitment = create_asset_note.commitment_point();

        let proof_generation_key = minting_key.sapling_proof_generation_key();

        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);
        let randomness = jubjub::Fr::from_bytes_wide(&buffer);
        let value_commitment = asset_info
            .asset_type()
            .value_commitment(mint_asset_note.value, randomness);

        // TODO: There may be a simpler or faster alternative to the dh keys
        // since there's no need for the concept of a "spender"
        let diffie_hellman_keys = mint_asset_note.owner.generate_diffie_hellman_keys();
        let merkle_note = MerkleNote::new(
            minting_key,
            mint_asset_note,
            &value_commitment,
            &diffie_hellman_keys,
        );

        // Mint proof
        let mint_circuit = MintAsset {
            asset_info: Some(asset_info),
            proof_generation_key: Some(proof_generation_key),
            create_commitment_randomness: Some(create_commitment_randomness),
            mint_commitment_randomness: Some(mint_commitment_randomness),
            auth_path: sapling_auth_path(create_asset_note_witness),
            anchor: Some(create_asset_note_witness.root_hash()),
            value_commitment: Some(value_commitment),
        };
        let mint_proof = groth16::create_random_proof(
            mint_circuit,
            &sapling_bls12::SAPLING.mint_asset_params,
            &mut OsRng,
        )?;

        let params = MintAssetParams {
            proof: mint_proof,
            // TODO: I think this comes from the create note?
            _mint_commitment_randomness: mint_commitment_randomness,
            create_asset_commitment,
            asset_type: asset_info.asset_type(),
            root_hash: create_asset_note_witness.root_hash(),
            merkle_note,
        };

        Ok(params)
    }

    pub fn post(&self) -> Result<MintAssetProof, errors::SaplingProofError> {
        let mint_asset_proof = MintAssetProof {
            proof: self.proof.clone(),
            create_asset_commitment: self.create_asset_commitment,
            asset_type: self.asset_type,
            root_hash: self.root_hash,
            merkle_note: self.merkle_note,
        };

        mint_asset_proof.verify_proof()?;

        Ok(mint_asset_proof)
    }

    pub(crate) fn serialize_signature_fields(&self, mut writer: impl io::Write) -> io::Result<()> {
        self.proof.write(&mut writer)?;
        writer.write_all(&self.create_asset_commitment.to_bytes())?;
        writer.write_all(self.asset_type.get_identifier())?;
        writer.write_all(&self.root_hash.to_bytes())?;
        self.merkle_note.write(&mut writer)?;
        Ok(())
    }
}

#[derive(Clone)]
pub struct MintAssetProof {
    pub(crate) proof: groth16::Proof<Bls12>,
    pub(crate) create_asset_commitment: bls12_381::Scalar,
    pub(crate) asset_type: AssetType,
    pub(crate) root_hash: bls12_381::Scalar,
    pub(crate) merkle_note: MerkleNote,
}

impl MintAssetProof {
    /// Load a MintAssetProof from a Read implementation( e.g: socket, file)
    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, errors::SaplingProofError> {
        let proof = groth16::Proof::read(&mut reader)?;

        let create_asset_commitment = read_scalar(&mut reader).map_err(|_| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "Unable to convert create asset note commitment",
            )
        })?;

        let asset_type = {
            let mut bytes: AssetIdentifier = [0u8; ASSET_IDENTIFIER_LENGTH];
            reader.read_exact(&mut bytes)?;

            match AssetType::from_identifier(&bytes) {
                Ok(asset_type) => asset_type,
                Err(_) => return Err(errors::SaplingProofError::IOError),
            }
        };

        let root_hash = read_scalar(&mut reader)?;

        let merkle_note = MerkleNote::read(&mut reader)?;

        Ok(MintAssetProof {
            proof,
            create_asset_commitment,
            asset_type,
            root_hash,
            merkle_note,
        })
    }

    /// Stow the bytes of this CreateAssetProof in the given writer.
    pub fn write<W: io::Write>(&self, writer: W) -> io::Result<()> {
        self.serialize_signature_fields(writer)
    }

    pub fn verify_proof(&self) -> Result<(), errors::SaplingProofError> {
        let mut public_inputs = vec![Scalar::zero(); 7];

        let identifier_bits = multipack::bytes_to_bits_le(self.asset_type.get_identifier());
        let identifier_inputs = multipack::compute_multipacking(&identifier_bits);
        public_inputs[0] = identifier_inputs[0];
        public_inputs[1] = identifier_inputs[1];

        public_inputs[2] = self.create_asset_commitment;
        public_inputs[3] = self.root_hash;

        let value_commitment_point = self.merkle_note.value_commitment.to_affine();
        public_inputs[4] = value_commitment_point.get_u();
        public_inputs[5] = value_commitment_point.get_v();

        public_inputs[6] = self.merkle_note.note_commitment;

        // Verify proof
        let verify_result = groth16::verify_proof(
            &sapling_bls12::SAPLING.mint_asset_verifying_key,
            &self.proof,
            &public_inputs[..],
        );

        // TODO: Extend SaplingProofError with From<bellman::VerificationError>
        // so we can use ? operator
        if verify_result.is_err() {
            return Err(errors::SaplingProofError::VerificationFailed);
        }

        Ok(())
    }

    pub(crate) fn serialize_signature_fields(&self, mut writer: impl io::Write) -> io::Result<()> {
        self.proof.write(&mut writer)?;
        writer.write_all(&self.create_asset_commitment.to_bytes())?;
        writer.write_all(self.asset_type.get_identifier())?;
        writer.write_all(&self.root_hash.to_bytes())?;
        self.merkle_note.write(&mut writer)?;
        Ok(())
    }
}
