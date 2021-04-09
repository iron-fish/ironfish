/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Nullifier } from '../blockchain/nullifiers'
import { VerificationResult } from '../consensus/verifier'

export interface Spend<H> {
  nullifier: Nullifier
  commitment: H
  size: number
}

export interface Transaction<E, H> {
  /**
   * Verify whether or not all the transactions in the list are valid proofs.
   */
  verify(): VerificationResult

  /**
   * The number of notes in the transaction.
   */
  notesLength(): number

  /**
   * Iterate over all the notes created by this transaction.
   */
  notes(): Iterable<E>

  /**
   * The number of spends in the transaction.
   */
  spendsLength(): number

  /**
   * Iterate over all the spends in the transaction. A spend includes a nullifier,
   * indicating that a note was spent, and a commitment committing to
   * the root hash and tree size at the time the note was spent.
   */
  spends(): Iterable<Spend<H>>

  /**
   * Preallocate any resources necessary for using the transaction.
   */
  takeReference(): unknown

  /**
   * Return any resources necessary for using the transaction.
   */
  returnReference(): void

  /**
   * Wraps the given callback in takeReference and returnReference.
   */
  withReference<R>(callback: (transaction: unknown) => R): R

  /**
   * Get the transaction fee for this transactions.
   *
   * In general, each transaction has outputs lower than the amount spent; the
   * miner can collect the difference as a transaction fee.
   *
   * In a block header's minersFee transaction, the opposite happens;
   * the miner creates a block with zero spends and output equal to the sum
   * of the miner's fee for the block's transaction, plus the block chain's
   * mining reward.
   *
   * The transaction fee is the difference between outputs and spends on the
   * transaction.
   */
  transactionFee(): bigint

  /**
   * Get transaction signature for this transaction.
   */
  transactionSignature(): Buffer

  /**
   * Get the transaction hash.
   */
  transactionHash(): Buffer
}

export default Transaction
