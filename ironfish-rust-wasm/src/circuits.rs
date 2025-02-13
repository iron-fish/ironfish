/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{errors::IronfishError, keys::EphemeralKeyPair, wasm_bindgen_wrapper};
use wasm_bindgen::prelude::*;

wasm_bindgen_wrapper! {
    #[derive(Clone, Debug)]
    pub struct SpendCircuit(ironfish_zkp::proofs::Spend);
}

#[wasm_bindgen]
impl SpendCircuit {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        Ok(Self(ironfish_zkp::proofs::Spend::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
            .write(&mut buf)
            .expect("failed to serialize spend circuit");
        buf
    }
}

wasm_bindgen_wrapper! {
    #[derive(Clone, Debug)]
    pub struct OutputCircuit((ironfish_zkp::proofs::Output, ironfish::keys::EphemeralKeyPair));
}

#[wasm_bindgen]
impl OutputCircuit {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(mut bytes: &[u8]) -> Result<Self, IronfishError> {
        let circuit = ironfish_zkp::proofs::Output::read(&mut bytes)?;
        let key_pair = ironfish::keys::EphemeralKeyPair::read(&mut bytes)?;
        Ok(Self((circuit, key_pair)))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
             .0
            .write(&mut buf)
            .expect("failed to serialize output circuit");
        self.0
             .1
            .write(&mut buf)
            .expect("failed to serialize ephemeral key pair");
        buf
    }

    #[wasm_bindgen(getter, js_name = ephemeralKeyPair)]
    pub fn ephemeral_key_pair(&self) -> EphemeralKeyPair {
        self.0 .1.to_owned().into()
    }
}

wasm_bindgen_wrapper! {
    #[derive(Clone, Debug)]
    pub struct MintCircuit(ironfish_zkp::proofs::MintAsset);
}

#[wasm_bindgen]
impl MintCircuit {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        Ok(Self(ironfish_zkp::proofs::MintAsset::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
            .write(&mut buf)
            .expect("failed to serialize mint circuit");
        buf
    }
}

#[wasm_bindgen]
#[derive(Default, Clone, Debug)]
pub struct TransactionCircuits {
    pub(crate) spend_circuits: Vec<SpendCircuit>,
    pub(crate) output_circuits: Vec<OutputCircuit>,
    pub(crate) mint_circuits: Vec<MintCircuit>,
}

#[wasm_bindgen]
impl TransactionCircuits {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    #[wasm_bindgen(js_name = addSpendCircuit)]
    pub fn add_spend_circuit(&mut self, circuit: SpendCircuit) {
        self.spend_circuits.push(circuit)
    }

    #[wasm_bindgen(js_name = addOutputCircuit)]
    pub fn add_output_circuit(&mut self, circuit: OutputCircuit) {
        self.output_circuits.push(circuit)
    }

    #[wasm_bindgen(js_name = addMintCircuit)]
    pub fn add_mint_circuit(&mut self, circuit: MintCircuit) {
        self.mint_circuits.push(circuit)
    }

    #[wasm_bindgen(js_name = getSpendCircuits)]
    pub fn spend_circuits(&self) -> Vec<SpendCircuit> {
        self.spend_circuits.clone()
    }

    #[wasm_bindgen(js_name = getOutputCircuits)]
    pub fn output_circuits(&self) -> Vec<OutputCircuit> {
        self.output_circuits.clone()
    }

    #[wasm_bindgen(js_name = getMintCircuits)]
    pub fn mint_circuits(&self) -> Vec<MintCircuit> {
        self.mint_circuits.clone()
    }
}
