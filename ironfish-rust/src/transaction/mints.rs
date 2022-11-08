/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use bellman::groth16;
use bls12_381::{Bls12, Scalar};
use ironfish_zkp::{circuits::mint_asset::MintAsset, ProofGenerationKey};
use rand::thread_rng;

use crate::{
    assets::asset::{asset_generator_point, Asset},
    errors::IronfishError,
    sapling_bls12::SAPLING,
};

pub struct MintBuilder {
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

pub struct MintDescription {
    pub proof: groth16::Proof<Bls12>,

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

    pub fn public_inputs(&self) -> [Scalar; 0] {
        []
    }
}
