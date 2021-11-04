/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::{SaplingProofError, TransactionError},
    keys::SaplingKey,
    note::Note,
    transaction::{ProposedTransaction, Transaction},
    witness::WitnessTrait,
    Sapling,
};
use std::sync::Arc;
use zcash_primitives::jubjub::JubjubEngine;

/// Simple wrapper of the Transaction API for the case where there is exactly
/// one spender, and that spender is the person who receives the change.
///
/// This is a really lightweight facade for the normal client usage. The only
/// reason you might expect someone to use the ProposedTransaction it wraps is
/// for multi-party spending.
pub struct SimpleTransaction<J: JubjubEngine + pairing::MultiMillerLoop> {
    transaction: ProposedTransaction<J>,
    spender_key: SaplingKey<J>,
    intended_transaction_fee: u64,
}

impl<J: JubjubEngine + pairing::MultiMillerLoop> SimpleTransaction<J> {
    /// Create a new SimpleTransaction, initializing the sapling object and
    /// storing the spender_key of the person who receives all transactions.
    ///
    /// intended_transaction_fee is the amount the spender is willing to yield
    /// to the miner. Any excess spends above this fee go back to the spender in
    /// a change calculation.
    pub fn new(
        sapling: Arc<Sapling<J>>,
        spender_key: SaplingKey<J>,
        intended_transaction_fee: u64,
    ) -> SimpleTransaction<J> {
        SimpleTransaction {
            spender_key,
            transaction: ProposedTransaction::new(sapling),
            intended_transaction_fee,
        }
    }

    pub fn spend(
        &mut self,
        note: &Note<J>,
        witness: &dyn WitnessTrait<J>,
    ) -> Result<(), SaplingProofError> {
        self.transaction
            .spend(self.spender_key.clone(), note, witness)
    }

    pub fn receive(&mut self, note: &Note<J>) -> Result<(), SaplingProofError> {
        self.transaction.receive(&self.spender_key, note)
    }

    pub fn post(&mut self) -> Result<Transaction<J>, TransactionError> {
        self.transaction
            .post(&self.spender_key, None, self.intended_transaction_fee)
    }

    pub fn set_expiration_sequence(&mut self, expiration_sequence: u32) -> () {
        self.transaction
            .set_expiration_sequence(expiration_sequence);
    }
}
