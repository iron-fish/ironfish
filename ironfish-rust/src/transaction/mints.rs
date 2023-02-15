/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::io;

use bellman::{gadgets::multipack, groth16};
use bls12_381::{Bls12, Scalar};
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use group::{Curve, GroupEncoding};
use ironfish_zkp::{
    constants::SPENDING_KEY_GENERATOR,
    proofs::MintAsset,
    redjubjub::{self, Signature},
};
use rand::thread_rng;

use crate::{assets::asset::Asset, errors::IronfishError, sapling_bls12::SAPLING, SaplingKey};

use super::utils::verify_mint_proof;

/// Parameters used to build a circuit that verifies an asset can be minted with
/// a given key
pub struct MintBuilder {
    /// Asset to be minted
    pub asset: Asset,

    /// Amount of asset to mint
    pub value: u64,
}

impl MintBuilder {
    pub fn new(asset: Asset, value: u64) -> Self {
        Self { asset, value }
    }

    pub fn build(
        &self,
        spender_key: &SaplingKey,
        public_key_randomness: &jubjub::Fr,
        randomized_public_key: &redjubjub::PublicKey,
    ) -> Result<UnsignedMintDescription, IronfishError> {
        let circuit = MintAsset {
            name: self.asset.name,
            metadata: self.asset.metadata,
            proof_generation_key: Some(spender_key.sapling_proof_generation_key()),
            public_key_randomness: Some(*public_key_randomness),
        };

        let proof = groth16::create_random_proof(circuit, &SAPLING.mint_params, &mut thread_rng())?;

        let blank_signature = {
            let buf = [0u8; 64];
            Signature::read(&mut buf.as_ref())?
        };

        let mint_description = MintDescription {
            proof,
            asset: self.asset,
            value: self.value,
            authorizing_signature: blank_signature,
        };

        verify_mint_proof(
            &mint_description.proof,
            &mint_description.public_inputs(randomized_public_key),
        )?;

        Ok(UnsignedMintDescription {
            public_key_randomness: *public_key_randomness,
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
        let private_key = redjubjub::PrivateKey(spender_key.spend_authorizing_key);
        let randomized_private_key = private_key.randomize(self.public_key_randomness);
        let randomized_public_key =
            redjubjub::PublicKey::from_private(&randomized_private_key, SPENDING_KEY_GENERATOR);

        let transaction_randomized_public_key =
            redjubjub::PublicKey(spender_key.view_key.authorizing_key.into())
                .randomize(self.public_key_randomness, SPENDING_KEY_GENERATOR);

        if randomized_public_key.0 != transaction_randomized_public_key.0 {
            return Err(IronfishError::InvalidSigningKey);
        }

        let mut data_to_be_signed = [0; 64];
        data_to_be_signed[..32].copy_from_slice(&randomized_public_key.0.to_bytes());
        data_to_be_signed[32..].copy_from_slice(&signature_hash[..]);

        self.description.authorizing_signature = randomized_private_key.sign(
            &data_to_be_signed,
            &mut thread_rng(),
            SPENDING_KEY_GENERATOR,
        );

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

    /// Amount of asset to mint
    pub value: u64,

    /// Signature of the owner authorizing the mint action. This value is
    /// calculated after the transaction is signed since the value is dependent
    /// on the binding signature key
    pub authorizing_signature: redjubjub::Signature,
}

impl MintDescription {
    /// Verify that the signature on this proof is signing the provided input
    /// with the randomized_public_key on this proof.
    pub fn verify_signature(
        &self,
        signature_hash_value: &[u8; 32],
        randomized_public_key: &redjubjub::PublicKey,
    ) -> Result<(), IronfishError> {
        if randomized_public_key.0.is_small_order().into() {
            return Err(IronfishError::IsSmallOrder);
        }
        let mut data_to_be_signed = [0; 64];
        data_to_be_signed[..32].copy_from_slice(&randomized_public_key.0.to_bytes());
        data_to_be_signed[32..].copy_from_slice(&signature_hash_value[..]);

        if !randomized_public_key.verify(
            &data_to_be_signed,
            &self.authorizing_signature,
            SPENDING_KEY_GENERATOR,
        ) {
            return Err(IronfishError::VerificationFailed);
        }

        Ok(())
    }

    pub fn public_inputs(&self, randomized_public_key: &redjubjub::PublicKey) -> [Scalar; 4] {
        let mut public_inputs = [Scalar::zero(); 4];

        let randomized_public_key_point = randomized_public_key.0.to_affine();
        public_inputs[0] = randomized_public_key_point.get_u();
        public_inputs[1] = randomized_public_key_point.get_v();

        let asset_id_bits = multipack::bytes_to_bits_le(self.asset.id());
        let asset_id_inputs = multipack::compute_multipacking(&asset_id_bits);
        public_inputs[2] = asset_id_inputs[0];
        public_inputs[3] = asset_id_inputs[1];

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
        writer.write_u64::<LittleEndian>(self.value)?;

        Ok(())
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let proof = groth16::Proof::read(&mut reader)?;
        let asset = Asset::read(&mut reader)?;
        let value = reader.read_u64::<LittleEndian>()?;
        let authorizing_signature = redjubjub::Signature::read(&mut reader)?;

        Ok(MintDescription {
            proof,
            asset,
            value,
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
    use ff::Field;
    use ironfish_zkp::{constants::SPENDING_KEY_GENERATOR, redjubjub};
    use rand::thread_rng;

    use crate::{
        assets::asset::Asset,
        transaction::{
            mints::{MintBuilder, MintDescription},
            utils::verify_mint_proof,
        },
        SaplingKey,
    };

    #[test]
    /// Test that we can create a builder with a valid asset and proof
    /// generation key
    fn test_mint_builder() {
        let key = SaplingKey::generate_key();
        let owner = key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(owner, name, metadata).unwrap();

        let value = 5;

        let public_key_randomness = jubjub::Fr::random(thread_rng());
        let randomized_public_key = redjubjub::PublicKey(key.view_key.authorizing_key.into())
            .randomize(public_key_randomness, SPENDING_KEY_GENERATOR);

        let mint = MintBuilder::new(asset, value);
        let unsigned_mint = mint
            .build(&key, &public_key_randomness, &randomized_public_key)
            .expect("should build valid mint description");

        // Signature comes from the transaction, normally
        let sig_hash = [0u8; 32];

        let description = unsigned_mint
            .sign(&key, &sig_hash)
            .expect("should be able to sign proof");

        verify_mint_proof(
            &description.proof,
            &description.public_inputs(&randomized_public_key),
        )
        .expect("proof should check out");

        description
            .verify_signature(&sig_hash, &randomized_public_key)
            .expect("should be able to verify signature");

        let other_sig_hash = [1u8; 32];
        assert!(description
            .verify_signature(&other_sig_hash, &randomized_public_key)
            .is_err());

        let other_randomized_public_key = redjubjub::PublicKey(key.view_key.authorizing_key.into())
            .randomize(jubjub::Fr::random(thread_rng()), SPENDING_KEY_GENERATOR);
        assert!(description
            .verify_signature(&sig_hash, &other_randomized_public_key)
            .is_err());
    }

    #[test]
    fn test_mint_description_serialization() {
        let key = SaplingKey::generate_key();
        let owner = key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(owner, name, metadata).unwrap();

        let value = 5;

        let public_key_randomness = jubjub::Fr::random(thread_rng());
        let randomized_public_key = redjubjub::PublicKey(key.view_key.authorizing_key.into())
            .randomize(public_key_randomness, SPENDING_KEY_GENERATOR);

        let mint = MintBuilder::new(asset, value);
        let unsigned_mint = mint
            .build(&key, &public_key_randomness, &randomized_public_key)
            .expect("should build valid mint description");

        // Signature comes from the transaction, normally
        let sig_hash = [0u8; 32];

        let description = unsigned_mint
            .sign(&key, &sig_hash)
            .expect("should be able to sign proof");

        verify_mint_proof(
            &description.proof,
            &description.public_inputs(&randomized_public_key),
        )
        .expect("proof should check out");

        let mut serialized_description = vec![];
        description
            .write(&mut serialized_description)
            .expect("should be able to serialize description");

        let deserialized_description = MintDescription::read(&serialized_description[..])
            .expect("should be able to deserialize valid description");

        // Proof
        assert_eq!(description.proof.a, deserialized_description.proof.a);
        assert_eq!(description.proof.b, deserialized_description.proof.b);
        assert_eq!(description.proof.c, deserialized_description.proof.c);

        // Value
        assert_eq!(description.value, deserialized_description.value);
        assert_eq!(description.value, value);

        // Signature
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

        // Re-serialize for one final sanity check
        let mut reserialized_description = vec![];
        deserialized_description
            .write(&mut reserialized_description)
            .expect("should be able to serialize proof again");
        assert_eq!(serialized_description, reserialized_description);
    }
}
