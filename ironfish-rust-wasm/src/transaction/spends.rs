/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::IronfishError,
    keys::SaplingKey,
    primitives::{Nullifier, PublicKey, Scalar, Signature},
    wasm_bindgen_wrapper,
};
use ironfish::errors::IronfishErrorKind;
use wasm_bindgen::prelude::*;

wasm_bindgen_wrapper! {
    #[derive(Clone, Debug)]
    pub struct SpendDescription(ironfish::SpendDescription);
}

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

wasm_bindgen_wrapper! {
    #[derive(Clone, Debug)]
    pub struct UnsignedSpendDescription(ironfish::transaction::spends::UnsignedSpendDescription);
}

#[wasm_bindgen]
impl UnsignedSpendDescription {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        Ok(Self(
            ironfish::transaction::spends::UnsignedSpendDescription::read(bytes)?,
        ))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
            .write(&mut buf)
            .expect("failed to serialize unsigned spend description");
        buf
    }

    #[wasm_bindgen]
    pub fn sign(
        self,
        spender_key: &SaplingKey,
        signature_hash: &[u8],
    ) -> Result<SpendDescription, IronfishError> {
        let signature_hash: &[u8; 32] = signature_hash
            .try_into()
            .map_err(|_| IronfishErrorKind::InvalidData)?;
        self.0
            .sign(spender_key.as_ref(), signature_hash)
            .map(|d| d.into())
            .map_err(|e| e.into())
    }

    #[wasm_bindgen(js_name = addSignature)]
    pub fn add_signature(self, signature: Signature) -> SpendDescription {
        self.0.add_signature(signature.into()).into()
    }
}
