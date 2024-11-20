/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    assets::Asset,
    errors::IronfishError,
    keys::PublicAddress,
    primitives::{PublicKey, Scalar},
    wasm_bindgen_wrapper,
};
use ironfish::{errors::IronfishErrorKind, transaction::TransactionVersion};
use wasm_bindgen::prelude::*;

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
