/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::IronfishError,
    primitives::{Nullifier, PublicKey, Scalar},
};
use ironfish::errors::IronfishErrorKind;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, Debug)]
pub struct SpendDescription(ironfish::SpendDescription);

#[wasm_bindgen]
impl SpendDescription {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<SpendDescription, IronfishError> {
        Ok(Self(ironfish::SpendDescription::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
            .write(&mut buf)
            .expect("failed to serialize spend description");
        buf
    }

    #[wasm_bindgen(getter)]
    pub fn nullifier(&self) -> Nullifier {
        self.0.nullifier().into()
    }

    #[wasm_bindgen(getter, js_name = rootHash)]
    pub fn root_hash(&self) -> Scalar {
        self.0.root_hash().into()
    }

    #[wasm_bindgen(getter, js_name = treeSize)]
    pub fn tree_size(&self) -> u32 {
        self.0.tree_size()
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

impl From<ironfish::SpendDescription> for SpendDescription {
    fn from(d: ironfish::SpendDescription) -> Self {
        Self(d)
    }
}

impl AsRef<ironfish::SpendDescription> for SpendDescription {
    fn as_ref(&self) -> &ironfish::SpendDescription {
        &self.0
    }
}
