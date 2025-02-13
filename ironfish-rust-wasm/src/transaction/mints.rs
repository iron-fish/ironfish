/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    assets::Asset,
    errors::IronfishError,
    keys::{PublicAddress, SaplingKey},
    primitives::{PublicKey, Scalar, Signature},
    wasm_bindgen_wrapper,
};
use ironfish::{errors::IronfishErrorKind, transaction::TransactionVersion};
use wasm_bindgen::prelude::*;

#[cfg(feature = "transaction-builders")]
use crate::{keys::ProofGenerationKey, primitives::Fr};

wasm_bindgen_wrapper! {
    #[derive(Clone, Debug)]
    pub struct MintDescription(ironfish::transaction::mints::MintDescription);
}

#[wasm_bindgen]
impl MintDescription {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<MintDescription, IronfishError> {
        Ok(Self(ironfish::transaction::mints::MintDescription::read(
            bytes,
            TransactionVersion::V1,
        )?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
            .write(&mut buf, TransactionVersion::V1)
            .expect("failed to serialize mint description");
        buf
    }

    #[wasm_bindgen(getter)]
    pub fn assets(&self) -> Asset {
        self.0.asset.into()
    }

    #[wasm_bindgen(getter)]
    pub fn value(&self) -> u64 {
        self.0.value
    }

    #[wasm_bindgen(getter)]
    pub fn owner(&self) -> PublicAddress {
        self.0.owner.into()
    }

    #[wasm_bindgen(js_name = verifySignature)]
    pub fn verify_signature(
        &self,
        signature: &[u8],
        randomized_public_key: &PublicKey,
    ) -> Result<(), IronfishError> {
        let signature = signature
            .try_into()
            .map_err(|_| IronfishErrorKind::InvalidSignature)?;
        self.0
            .verify_signature(signature, randomized_public_key.as_ref())
            .map_err(|e| e.into())
    }

    #[wasm_bindgen(js_name = partialVerify)]
    pub fn partial_verify(&self) -> Result<(), IronfishError> {
        self.0.partial_verify().map_err(|e| e.into())
    }

    #[wasm_bindgen(js_name = publicInputs)]
    pub fn public_inputs(&self, randomized_public_key: &PublicKey) -> Vec<Scalar> {
        self.0
            .public_inputs(randomized_public_key.as_ref())
            .into_iter()
            .map(Scalar::from)
            .collect()
    }
}

wasm_bindgen_wrapper! {
    #[derive(Clone, Debug)]
    pub struct UnsignedMintDescription(ironfish::transaction::mints::UnsignedMintDescription);
}

#[wasm_bindgen]
impl UnsignedMintDescription {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        Ok(Self(
            ironfish::transaction::mints::UnsignedMintDescription::read(
                bytes,
                TransactionVersion::V1,
            )?,
        ))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
            .write(&mut buf, TransactionVersion::V1)
            .expect("failed to serialize unsigned mint description");
        buf
    }

    #[wasm_bindgen]
    pub fn sign(
        self,
        spender_key: &SaplingKey,
        signature_hash: &[u8],
    ) -> Result<MintDescription, IronfishError> {
        let signature_hash: &[u8; 32] = signature_hash
            .try_into()
            .map_err(|_| IronfishErrorKind::InvalidData)?;
        self.0
            .sign(spender_key.as_ref(), signature_hash)
            .map(|d| d.into())
            .map_err(|e| e.into())
    }

    #[wasm_bindgen(js_name = addSignature)]
    pub fn add_signature(self, signature: Signature) -> MintDescription {
        self.0.add_signature(signature.into()).into()
    }
}

#[cfg(feature = "transaction-builders")]
wasm_bindgen_wrapper! {
    #[derive(Clone, Debug)]
    pub struct MintBuilder(ironfish::transaction::mints::MintBuilder);
}

#[wasm_bindgen]
#[cfg(feature = "transaction-builders")]
impl MintBuilder {
    #[wasm_bindgen(constructor)]
    pub fn new(asset: Asset, value: u64) -> Self {
        Self(ironfish::transaction::mints::MintBuilder::new(
            asset.into(),
            value,
        ))
    }

    #[wasm_bindgen]
    pub fn build(
        self,
        proof_generation_key: &ProofGenerationKey,
        public_address: &PublicAddress,
        public_key_randomness: &Fr,
        randomized_public_key: &PublicKey,
    ) -> Result<UnsignedMintDescription, IronfishError> {
        self.0
            .build(
                proof_generation_key.as_ref(),
                public_address.as_ref(),
                public_key_randomness.as_ref(),
                randomized_public_key.as_ref(),
            )
            .map(|d| d.into())
            .map_err(|e| e.into())
    }
}

#[cfg(test)]
mod tests {
    #[cfg(feature = "transaction-builders")]
    mod builder {
        use crate::{assets::Asset, keys::SaplingKey, transaction::MintBuilder};
        use rand::{thread_rng, Rng};
        use wasm_bindgen_test::wasm_bindgen_test;

        #[test]
        #[wasm_bindgen_test]
        fn build() {
            let key = SaplingKey::random();
            let asset = Asset::from_parts(key.public_address(), "asset name", "asset metadata")
                .expect("failed to create asset");
            let randomized_public_key_pair = key.view_key().randomized_public_key_pair();

            let unsigned = MintBuilder::new(asset, 123)
                .build(
                    &key.proof_generation_key(),
                    &key.public_address(),
                    &randomized_public_key_pair.public_key_randomness(),
                    &randomized_public_key_pair.randomized_public_key(),
                )
                .expect("failed to build mint description");

            let sign_hash: [u8; 32] = thread_rng().gen();
            let signed = unsigned
                .sign(&key, &sign_hash)
                .expect("failed to sign mint description");

            signed
                .verify_signature(
                    &sign_hash,
                    &randomized_public_key_pair.randomized_public_key(),
                )
                .expect("signature verification failed");
        }
    }
}
