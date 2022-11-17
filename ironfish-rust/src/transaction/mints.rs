/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::io;

use bellman::{gadgets::multipack, groth16};
use bls12_381::{Bls12, Scalar};
use ff::Field;
use group::{Curve, GroupEncoding};
use ironfish_zkp::{
    constants::ASSET_KEY_GENERATOR,
    proofs::MintAsset,
    redjubjub::{self, Signature},
    ValueCommitment,
};
use jubjub::ExtendedPoint;
use rand::thread_rng;

use crate::{
    assets::asset::{asset_generator_point, Asset},
    errors::IronfishError,
    sapling_bls12::SAPLING,
    SaplingKey,
};

/// Parameters used to build a circuit that verifies an asset can be minted with
/// a given key
pub struct MintBuilder {
    /// Asset to be minted
    pub asset: Asset,

    /// Commitment to represent the value. Even though the value of the mint is
    /// public, we still need the commitment to balance the transaction
    pub value_commitment: ValueCommitment,
}

impl MintBuilder {
    pub fn new(asset: Asset, value: u64) -> Self {
        let value_commitment = ValueCommitment {
            value,
            randomness: jubjub::Fr::random(thread_rng()),
        };

        Self {
            asset,
            value_commitment,
        }
    }

    /// Get the value_commitment from this proof as an edwards Point.
    ///
    /// This integrates the value and randomness into a single point, using an
    /// appropriate generator.
    pub fn value_commitment_point(&self) -> ExtendedPoint {
        ExtendedPoint::from(self.value_commitment.commitment())
    }

    pub fn build(
        &self,
        spender_key: &SaplingKey,
    ) -> Result<UnsignedMintDescription, IronfishError> {
        let public_key_randomness = jubjub::Fr::random(thread_rng());

        let circuit = MintAsset {
            name: self.asset.name,
            metadata: self.asset.metadata,
            nonce: self.asset.nonce,
            asset_authorization_key: Some(spender_key.asset_authorization_key()),
            value_commitment: Some(self.value_commitment.clone()),
            public_key_randomness: Some(public_key_randomness),
        };

        let proof = groth16::create_random_proof(circuit, &SAPLING.mint_params, &mut thread_rng())?;

        let randomized_public_key = redjubjub::PublicKey(spender_key.asset_public_key().into())
            .randomize(public_key_randomness, ASSET_KEY_GENERATOR);

        let blank_signature = {
            let buf = [0u8; 64];
            Signature::read(&mut buf.as_ref())?
        };

        let mint_description = MintDescription {
            proof,
            asset: self.asset,
            value_commitment: self.value_commitment_point(),
            randomized_public_key,
            authorizing_signature: blank_signature,
        };

        mint_description.verify_proof()?;

        Ok(UnsignedMintDescription {
            public_key_randomness,
            description: mint_description,
        })
    }
}

/// The publicly visible values of a mint description in a transaction.
/// These fields get serialized when computing the transaction hash and are used
/// to prove that the owner has knowledge of these values.
pub struct UnsignedMintDescription {
    /// Used to add randomness to signature generation. Referred to as `ar` in
    /// the literature.
    public_key_randomness: jubjub::Fr,

    /// Proof and public parameters for a user action to issue supply for an
    /// asset.
    pub(crate) description: MintDescription,
}

impl UnsignedMintDescription {
    pub fn sign(
        mut self,
        spender_key: &SaplingKey,
        signature_hash: &[u8; 32],
    ) -> Result<MintDescription, IronfishError> {
        let private_key = redjubjub::PrivateKey(spender_key.asset_authorization_key);
        let randomized_private_key = private_key.randomize(self.public_key_randomness);
        let randomized_public_key =
            redjubjub::PublicKey::from_private(&randomized_private_key, ASSET_KEY_GENERATOR);

        if randomized_public_key.0 != self.description.randomized_public_key.0 {
            return Err(IronfishError::InvalidSigningKey);
        }

        let mut data_to_be_signed = [0; 64];
        data_to_be_signed[..32]
            .copy_from_slice(&self.description.randomized_public_key.0.to_bytes());
        data_to_be_signed[32..].copy_from_slice(&signature_hash[..]);

        self.description.authorizing_signature =
            randomized_private_key.sign(&data_to_be_signed, &mut thread_rng(), ASSET_KEY_GENERATOR);

        Ok(self.description)
    }
}

/// This description represents an action to increase the supply of an existing
/// asset on Iron Fish
#[derive(Clone)]
pub struct MintDescription {
    /// Proof that the mint was valid for the provided owner and asset
    pub proof: groth16::Proof<Bls12>,

    /// Asset which is being minted
    pub asset: Asset,

    /// Randomized commitment to represent the value being minted in this proof
    /// needed to balance the transaction.
    pub value_commitment: ExtendedPoint,

    /// Used to add randomness to signature generation without leaking the
    /// key. Referred to as `ar` in the literature.
    pub randomized_public_key: redjubjub::PublicKey,

    /// Signature of the owner authorizing the mint action. This value is
    /// calculated after the transaction is signed since the value is dependent
    /// on the binding signature key
    pub authorizing_signature: redjubjub::Signature,
}

impl MintDescription {
    pub fn verify_proof(&self) -> Result<(), IronfishError> {
        // Verify that the identifier maps to a valid generator point
        asset_generator_point(&self.asset.identifier)?;

        self.verify_not_small_order()?;

        groth16::verify_proof(
            &SAPLING.mint_verifying_key,
            &self.proof,
            &self.public_inputs()[..],
        )?;

        Ok(())
    }

    pub fn verify_not_small_order(&self) -> Result<(), IronfishError> {
        if self.value_commitment.is_small_order().into() {
            return Err(IronfishError::IsSmallOrder);
        }

        Ok(())
    }

    /// Verify that the signature on this proof is signing the provided input
    /// with the randomized_public_key on this proof.
    pub fn verify_signature(&self, signature_hash_value: &[u8; 32]) -> Result<(), IronfishError> {
        if self.randomized_public_key.0.is_small_order().into() {
            return Err(IronfishError::IsSmallOrder);
        }
        let mut data_to_be_signed = [0; 64];
        data_to_be_signed[..32].copy_from_slice(&self.randomized_public_key.0.to_bytes());
        data_to_be_signed[32..].copy_from_slice(&signature_hash_value[..]);

        if !self.randomized_public_key.verify(
            &data_to_be_signed,
            &self.authorizing_signature,
            ASSET_KEY_GENERATOR,
        ) {
            return Err(IronfishError::VerificationFailed);
        }

        Ok(())
    }

    pub fn public_inputs(&self) -> [Scalar; 6] {
        let mut public_inputs = [Scalar::zero(); 6];

        let identifier_bits = multipack::bytes_to_bits_le(self.asset.identifier());
        let identifier_inputs = multipack::compute_multipacking(&identifier_bits);
        public_inputs[0] = identifier_inputs[0];
        public_inputs[1] = identifier_inputs[1];

        let value_commitment_point = self.value_commitment.to_affine();
        public_inputs[2] = value_commitment_point.get_u();
        public_inputs[3] = value_commitment_point.get_v();

        let randomized_public_key_point = self.randomized_public_key.0.to_affine();
        public_inputs[4] = randomized_public_key_point.get_u();
        public_inputs[5] = randomized_public_key_point.get_v();

        public_inputs
    }

    /// Write the signature of this proof to the provided writer.
    ///
    /// The signature is used by the transaction to calculate the signature
    /// hash. Having this data essentially binds the note to the transaction,
    /// proving that it is actually part of that transaction.
    pub(crate) fn serialize_signature_fields<W: io::Write>(
        &self,
        mut writer: W,
    ) -> Result<(), IronfishError> {
        self.proof.write(&mut writer)?;
        self.asset.write(&mut writer)?;
        writer.write_all(&self.value_commitment.to_bytes())?;
        writer.write_all(&self.randomized_public_key.0.to_bytes())?;

        Ok(())
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let proof = groth16::Proof::read(&mut reader)?;
        let asset = Asset::read(&mut reader)?;

        let value_commitment = {
            let mut bytes = [0; 32];
            reader.read_exact(&mut bytes)?;

            Option::from(ExtendedPoint::from_bytes(&bytes)).ok_or(IronfishError::InvalidData)?
        };

        let randomized_public_key = redjubjub::PublicKey::read(&mut reader)?;

        let authorizing_signature = redjubjub::Signature::read(&mut reader)?;

        Ok(MintDescription {
            proof,
            asset,
            value_commitment,
            randomized_public_key,
            authorizing_signature,
        })
    }

    /// Stow the bytes of this [`MintDescription`] in the given writer.
    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        self.serialize_signature_fields(&mut writer)?;
        self.authorizing_signature.write(&mut writer)?;

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use crate::{
        assets::asset::Asset,
        transaction::mints::{MintBuilder, MintDescription},
        SaplingKey,
    };

    #[test]
    /// Test that we can create a builder with a valid asset and proof
    /// generation key
    fn test_mint_builder() {
        let key = SaplingKey::generate_key();
        let owner = key.asset_public_key();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(owner, name, metadata).unwrap();

        let value = 5;

        let mint = MintBuilder::new(asset, value);
        let unsigned_mint = mint
            .build(&key)
            .expect("should build valid mint description");

        // Signature comes from the transaction, normally
        let sig_hash = [0u8; 32];

        let description = unsigned_mint
            .sign(&key, &sig_hash)
            .expect("should be able to sign proof");

        description.verify_proof().expect("proof should check out");

        description
            .verify_signature(&sig_hash)
            .expect("should be able to verify signature");

        let other_sig_hash = [1u8; 32];
        assert!(description.verify_signature(&other_sig_hash).is_err());
    }

    #[test]
    fn test_mint_description_serialization() {
        let key = SaplingKey::generate_key();
        let owner = key.asset_public_key();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(owner, name, metadata).unwrap();

        let value = 5;

        let mint = MintBuilder::new(asset, value);
        let unsigned_mint = mint
            .build(&key)
            .expect("should build valid mint description");

        // Signature comes from the transaction, normally
        let sig_hash = [0u8; 32];

        let description = unsigned_mint
            .sign(&key, &sig_hash)
            .expect("should be able to sign proof");

        description.verify_proof().expect("proof should check out");

        let mut serialized_description = vec![];
        description
            .write(&mut serialized_description)
            .expect("should be able to serialize description");

        let deserialized_description = MintDescription::read(&serialized_description[..])
            .expect("should be able to deserialize valid description");

        assert_eq!(description.proof.a, deserialized_description.proof.a);
        assert_eq!(description.proof.b, deserialized_description.proof.b);
        assert_eq!(description.proof.c, deserialized_description.proof.c);
        assert_eq!(
            description.value_commitment,
            deserialized_description.value_commitment
        );
        assert_eq!(
            description.randomized_public_key.0,
            deserialized_description.randomized_public_key.0
        );

        // Instantiated with different data just to ensure this test actually does what we expect
        let mut description_sig = [9u8; 64];
        let mut deserialized_description_sig = [5u8; 64];

        description
            .authorizing_signature
            .write(&mut description_sig[..])
            .unwrap();

        deserialized_description
            .authorizing_signature
            .write(&mut deserialized_description_sig[..])
            .unwrap();

        assert_eq!(description_sig, deserialized_description_sig);

        let mut reserialized_description = vec![];
        deserialized_description
            .write(&mut reserialized_description)
            .expect("should be able to serialize proof again");
        assert_eq!(serialized_description, reserialized_description);
    }
}
