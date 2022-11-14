/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::io;

use bellman::{gadgets::multipack, groth16};
use bls12_381::{Bls12, Scalar};
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use ff::Field;
use group::GroupEncoding;
use ironfish_zkp::{circuits::mint_asset::MintAsset, ValueCommitment};
use jubjub::ExtendedPoint;
use rand::thread_rng;

use crate::{
    assets::asset::{asset_generator_point, Asset},
    errors::IronfishError,
    sapling_bls12::SAPLING,
    serializing::read_scalar,
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
        asset_authorization_key: jubjub::Fr,
    ) -> Result<MintDescription, IronfishError> {
        let circuit = MintAsset {
            name: self.asset.name,
            metadata: self.asset.metadata,
            nonce: self.asset.nonce,
            asset_authorization_key: Some(asset_authorization_key),
        };

        let proof = groth16::create_random_proof(circuit, &SAPLING.mint_params, &mut thread_rng())?;

        let mint_description = MintDescription {
            proof,
            asset: self.asset,
            value_commitment: self.value_commitment.clone(),
        };

        mint_description.verify_proof()?;

        Ok(mint_description)
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

    /// Commitment to represent the value. Even though the value of the mint is
    /// public, we still need the commitment to balance the transaction
    pub value_commitment: ValueCommitment,
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
        let value_commitment_point = ExtendedPoint::from(self.value_commitment.commitment());
        if value_commitment_point.is_small_order().into() {
            return Err(IronfishError::IsSmallOrder);
        }

        Ok(())
    }

    pub fn public_inputs(&self) -> [Scalar; 2] {
        let mut public_inputs = [Scalar::zero(); 2];

        let identifier_bits = multipack::bytes_to_bits_le(self.asset.identifier());
        let identifier_inputs = multipack::compute_multipacking(&identifier_bits);
        public_inputs[0] = identifier_inputs[0];
        public_inputs[1] = identifier_inputs[1];

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
        writer.write_all(&self.value_commitment.commitment().to_bytes())?;

        Ok(())
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let proof = groth16::Proof::read(&mut reader)?;
        let asset = Asset::read(&mut reader)?;

        let value = reader.read_u64::<LittleEndian>()?;
        let randomness: jubjub::Fr = read_scalar(&mut reader)?;

        let value_commitment = ValueCommitment { value, randomness };

        Ok(MintDescription {
            proof,
            asset,
            value_commitment,
        })
    }

    /// Stow the bytes of this [`MintDescription`] in the given writer.
    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        self.proof.write(&mut writer)?;
        self.asset.write(&mut writer)?;

        writer.write_u64::<LittleEndian>(self.value_commitment.value)?;
        writer.write_all(&self.value_commitment.randomness.to_bytes())?;

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use crate::{assets::asset::Asset, transaction::mints::MintBuilder, SaplingKey};

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
        // let mint_description = mint.build(key.sapling_proof_generation_key()).expect("should build valid mint description");

        // assert_eq!(mint_description.asset.identifier(), asset.identifier());

        // TODO(mgeist, rohanjadvani):
        // This is a placeholder assertion until the mint parameters are generated
        assert_eq!(asset.identifier(), mint.asset.identifier());
    }
}
