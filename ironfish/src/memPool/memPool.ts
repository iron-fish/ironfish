/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Captain from '../captain'
import { Nullifier } from '../captain/anchorChain/nullifiers'
import Transaction from '../captain/anchorChain/strategies/Transaction'
import { createRootLogger, Logger } from '../logger'
import { JsonSerializable } from '../serde'

export class MemPool<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
> {
  private transactions = new Map<string, T>()
  private readonly captain: Captain<E, H, T, SE, SH, ST>
  private readonly logger: Logger

  constructor(captain: Captain<E, H, T, SE, SH, ST>, logger: Logger = createRootLogger()) {
    this.captain = captain
    this.logger = logger.withTag('transactionpool')
  }

  size(): number {
    return this.transactions.size
  }

  exists(transactionHash: Buffer): boolean {
    const hash = transactionHash.toString('hex')
    return this.transactions.has(hash)
  }

  async *get(): AsyncGenerator<T, void, unknown> {
    await this.prune()

    for (const transaction of this.transactions.values()) {
      yield transaction
    }
  }

  /**
   * Accepts a transaction from the network
   */
  acceptTransaction(transaction: T): boolean {
    const hash = transaction.transactionHash().toString('hex')
    if (this.transactions.has(hash)) return false

    this.add(transaction)
    return true
  }

  private add(transaction: T): void {
    const hash = transaction.transactionHash().toString('hex')
    const fee = transaction.transactionFee()

    this.logger.debug('notes: ', transaction.notesLength())
    this.logger.debug('spends: ', transaction.spendsLength())
    this.logger.debug('fee: ', fee)

    this.transactions.set(hash, transaction)
    this.logger.info(`Accepted tx ${hash}, poolsize ${this.size()}`)
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
    const beforeSize = await this.captain.chain.nullifiers.size()

    const seenNullifiers: Nullifier[] = []
    let pruneCount = 0

    for (const transaction of this.transactions.values()) {
      const isValid = await this.isValidTransaction(transaction, beforeSize, seenNullifiers)

      if (!isValid) {
        const hash = transaction.transactionHash().toString('hex')
        this.transactions.delete(hash)
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
  async isValidTransaction(
    transaction: T,
    beforeSize: number,
    seenNullifiers: Nullifier[],
  ): Promise<boolean> {
    // it's faster to check if spends have been seen or not, so do that first
    for (const spend of transaction.spends()) {
      if (!(await this.captain.chain.verifier.verifySpend(spend, beforeSize))) {
        return false
      }
    }
    const validity = transaction.verify()
    if (!validity.valid) {
      return false
    }

    for (const spend of transaction.spends()) {
      for (const seen of seenNullifiers) {
        if (this.captain.strategy.nullifierHasher().hashSerde().equals(spend.nullifier, seen)) {
          return false
        }
      }

      seenNullifiers.push(spend.nullifier)
    }

    return true
  }
}
