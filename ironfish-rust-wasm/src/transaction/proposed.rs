/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    assets::{Asset, AssetIdentifier},
    circuits::{MintCircuit, OutputCircuit, SpendCircuit, TransactionCircuits},
    errors::IronfishError,
    keys::{PublicAddress, SaplingKey, ViewKey},
    note::Note,
    primitives::Fr,
    transaction::Transaction,
    wasm_bindgen_wrapper,
    witness::Witness,
};
use ironfish::transaction::TransactionVersion;
use wasm_bindgen::prelude::*;

wasm_bindgen_wrapper! {
    pub struct ProposedTransaction(ironfish::ProposedTransaction);
}

#[wasm_bindgen]
impl ProposedTransaction {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(ironfish::ProposedTransaction::new(TransactionVersion::V1))
    }

    #[wasm_bindgen(js_name = addSpend)]
    pub fn add_spend(&mut self, note: Note, witness: &Witness) -> Result<(), IronfishError> {
        self.0.add_spend(note.into(), witness.as_ref())?;
        Ok(())
    }

    #[wasm_bindgen(js_name = addOutput)]
    pub fn add_output(&mut self, note: Note) -> Result<(), IronfishError> {
        self.0.add_output(note.into())?;
        Ok(())
    }

    #[wasm_bindgen(js_name = addMint)]
    pub fn add_mint(&mut self, asset: Asset, value: u64) -> Result<(), IronfishError> {
        self.0.add_mint(asset.into(), value)?;
        Ok(())
    }

    #[wasm_bindgen(js_name = addBurn)]
    pub fn add_burn(&mut self, asset_id: AssetIdentifier, value: u64) -> Result<(), IronfishError> {
        self.0.add_burn(asset_id.into(), value)?;
        Ok(())
    }

    #[wasm_bindgen(getter)]
    pub fn expiration(&self) -> u32 {
        self.0.expiration()
    }

    #[wasm_bindgen(setter, js_name = expiration)]
    pub fn set_expiration(&mut self, sequence: u32) {
        self.0.set_expiration(sequence);
    }

    #[wasm_bindgen(js_name = buildCircuits)]
    pub fn build_circuits(
        &mut self,
        proof_authorizing_key: Fr,
        view_key: ViewKey,
        intended_transaction_fee: i64,
        change_goes_to: Option<PublicAddress>,
    ) -> Result<TransactionCircuits, IronfishError> {
        let (spend_circuits, output_circuits, mint_circuits) = self.0.build_circuits(
            proof_authorizing_key.into(),
            view_key.into(),
            intended_transaction_fee,
            change_goes_to.map(PublicAddress::into),
        )?;

        let spend_circuits = spend_circuits.into_iter().map(SpendCircuit::from).collect();
        let output_circuits = output_circuits
            .into_iter()
            .map(OutputCircuit::from)
            .collect();
        let mint_circuits = mint_circuits.into_iter().map(MintCircuit::from).collect();
        Ok(TransactionCircuits {
            spend_circuits,
            output_circuits,
            mint_circuits,
        })
    }

    #[wasm_bindgen]
    pub fn post(
        &mut self,
        spender_key: &SaplingKey,
        change_goes_to: Option<PublicAddress>,
        intended_transaction_fee: u64,
    ) -> Result<Transaction, IronfishError> {
        self.0
            .post(
                spender_key.as_ref(),
                change_goes_to.map(PublicAddress::into),
                intended_transaction_fee,
            )
            .map(Transaction::from)
            .map_err(IronfishError::from)
    }

    #[wasm_bindgen(js_name = postMinersFee)]
    pub fn post_miners_fee(
        &mut self,
        spender_key: &SaplingKey,
    ) -> Result<Transaction, IronfishError> {
        self.0
            .post_miners_fee(spender_key.as_ref())
            .map(Transaction::from)
            .map_err(IronfishError::from)
    }
}

impl Default for ProposedTransaction {
    fn default() -> Self {
        Self::new()
    }
}
