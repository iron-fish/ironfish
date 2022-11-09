/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::io;

use bellman::{gadgets::multipack, groth16};
use bls12_381::{Bls12, Scalar};
use ironfish_zkp::{circuits::mint_asset::MintAsset, ProofGenerationKey};
use rand::thread_rng;

use crate::{
    assets::asset::{asset_generator_point, Asset},
    errors::IronfishError,
    sapling_bls12::SAPLING,
};

/// Parameters used to build a circuit that verifies an asset can be minted with
/// a given key
pub struct MintBuilder {
    /// Asset to be minted
    pub asset: Asset,
}

impl MintBuilder {
    pub fn new(asset: Asset) -> Self {
        Self { asset }
    }

    pub fn build(
        &self,
        proof_generation_key: ProofGenerationKey,
    ) -> Result<MintDescription, IronfishError> {
        let circuit = MintAsset {
            name: self.asset.name,
            chain: self.asset.chain,
            network: self.asset.network,
            token_identifier: self.asset.token_identifier,
            owner: Some(self.asset.owner.sapling_payment_address()),
            nonce: self.asset.nonce,
            identifier: self.asset.identifier,
            proof_generation_key: Some(proof_generation_key),
        };

        let proof = groth16::create_random_proof(circuit, &SAPLING.mint_params, &mut thread_rng())?;

        let mint_description = MintDescription {
            proof,
            asset: self.asset,
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
}

impl MintDescription {
    pub fn verify_proof(&self) -> Result<(), IronfishError> {
        // Verify that the identifier maps to a valid generator point
        asset_generator_point(&self.asset.identifier)?;

        groth16::verify_proof(
            &SAPLING.mint_verifying_key,
            &self.proof,
            &self.public_inputs()[..],
        )?;

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

        Ok(())
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let proof = groth16::Proof::read(&mut reader)?;
        let asset = Asset::read(&mut reader)?;

        Ok(MintDescription { proof, asset })
    }

    /// Stow the bytes of this [`MintDescription`] in the given writer.
    pub fn write<W: io::Write>(&self, writer: W) -> Result<(), IronfishError> {
        self.serialize_signature_fields(writer)
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
        let owner = key.generate_public_address();
        let name = "name";
        let chain = "chain";
        let network = "network";
        let token_identifier = "token identifier";

        let asset = Asset::new(owner, name, chain, network, token_identifier).unwrap();

        let mint = MintBuilder::new(asset);
        // let mint_description = mint.build(key.sapling_proof_generation_key()).expect("should build valid mint description");

        // assert_eq!(mint_description.asset.identifier(), asset.identifier());

        // TODO(mgeist, rohanjadvani):
        // This is a placeholder assertion until the mint parameters are generated
        assert_eq!(asset.identifier(), mint.asset.identifier());
    }
}
