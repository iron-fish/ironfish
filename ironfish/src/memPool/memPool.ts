/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { createRootLogger, Logger } from '../logger'
import { Nullifier } from '../primitives/nullifier'
import { Transaction } from '../primitives/transaction'
import { Strategy } from '../strategy'

export class MemPool {
  transactions = new BufferMap<Transaction>()
  chain: Blockchain
  strategy: Strategy
  logger: Logger

  constructor(options: { strategy: Strategy; chain: Blockchain; logger?: Logger }) {
    const logger = options.logger || createRootLogger()

    this.chain = options.chain
    this.strategy = options.strategy
    this.logger = logger.withTag('mempool')
  }

  size(): number {
    return this.transactions.size
  }

  exists(transactionHash: Buffer): boolean {
    return this.transactions.has(transactionHash)
  }

  async *get(): AsyncGenerator<Transaction, void, unknown> {
    await this.prune()

    for (const transaction of this.transactions.values()) {
      yield transaction
    }
  }

  /**
   * Accepts a transaction from the network
   */
  async acceptTransaction(transaction: Transaction): Promise<boolean> {
    const hash = transaction.transactionHash()

    if (this.transactions.has(hash)) {
      return false
    }

    const { valid, reason } = await this.chain.verifier.verifyTransaction(transaction)
    if (!valid) {
      Assert.isNotUndefined(reason)
      this.logger.debug(`Invalid transaction '${hash.toString('hex')}': ${reason}`)
      return false
    }

    this.transactions.set(hash, transaction)

    this.logger.debug(`Accepted tx ${hash.toString('hex')}, poolsize ${this.size()}`)
    return true
  }

  /**
   * Scan the current transaction pool and remove any transactions that
   * are not valid. This removes:
   *  * transactions with invalid proofs
   *  * transactions that have been seen before the tree was `beforeSize`
   *  * transactions whose nullifiers were already seen in the transaction list
   */
  async prune(): Promise<void> {
    // The size of the tree before which any valid transactions must not have been seen
    const beforeSize = await this.chain.nullifiers.size()

    const seenNullifiers: Nullifier[] = []
    let pruneCount = 0

    for (const transaction of this.transactions.values()) {
      const isValid = await this.isValidTransaction(transaction, beforeSize, seenNullifiers)

      if (!isValid) {
        this.transactions.delete(transaction.transactionHash())
        pruneCount++
      }
    }

    if (pruneCount > 0) {
      this.logger.debug(`Pruned ${pruneCount} transactions from the waiting pool`)
    }
  }

  /**
   * Check whether or not the transaction is valid.
   *
   * Ensures that:
   *  * Proofs are valid
   *  * transactionFee is nonnegative
   *  * transaction spends have not been spent previously on the chain
   *  * transaction spends have not been spent previously in the list of seenNullifiers
   *  * transaction spend root actually existed in the notes tree
   *
   * @param transaction the transaction being tested
   * @param beforeSize the size of the nullifiers tree
   *     before which the transaction must not be seen
   * @param seenNullifiers list of nullifiers that were previously spent in this block.
   *     this method updates seenNullifiers as a side effect, and checks that there
   *     are no duplicates.
   *     TODO: seenNullifiers is currently a list, which requires a linear scan for each
   *     spend. It would be better if it were a set, but the JS native Set doesn't know how
   *     to operate on the Buffer backed Nullifier.
   *     TODO: transactions that have been previously verified are needlessly verified again
   *     when the only thing that might have changed is whether they have been spent before
   */
  private async isValidTransaction(
    transaction: Transaction,
    beforeSize: number,
    seenNullifiers: Nullifier[],
  ): Promise<boolean> {
    // it's faster to check if spends have been seen or not, so do that first
    for (const spend of transaction.spends()) {
      const verificationError = await this.chain.verifier.verifySpend(spend, beforeSize)
      if (verificationError) {
        return false
      }
    }
    const validity = await transaction.verify()
    if (!validity.valid) {
      return false
    }

    for (const spend of transaction.spends()) {
      for (const seen of seenNullifiers) {
        if (this.strategy.nullifierHasher.hashSerde().equals(spend.nullifier, seen)) {
          return false
        }
      }

      seenNullifiers.push(spend.nullifier)
    }

    return true
  }
}
