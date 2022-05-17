/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import FastPriorityQueue from 'fastpriorityqueue'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { createRootLogger, Logger } from '../logger'
import { MetricsMonitor } from '../metrics'
import { Block, BlockHeader } from '../primitives'
import { Transaction, TransactionHash } from '../primitives/transaction'

interface MempoolEntry {
  fee: bigint
  hash: TransactionHash
}

export class MemPool {
  readonly transactions = new BufferMap<Transaction>()
  readonly nullifiers = new BufferMap<Buffer>()
  readonly queue: FastPriorityQueue<MempoolEntry>
  head: BlockHeader | null

  private readonly chain: Blockchain
  private readonly logger: Logger
  private readonly metrics: MetricsMonitor

  constructor(options: { chain: Blockchain; metrics: MetricsMonitor; logger?: Logger }) {
    const logger = options.logger || createRootLogger()

    this.head = null
    this.queue = new FastPriorityQueue<MempoolEntry>((firstTransaction, secondTransaction) => {
      if (firstTransaction.fee === secondTransaction.fee) {
        return firstTransaction.hash.compare(secondTransaction.hash) > 0
      }
      return firstTransaction.fee > secondTransaction.fee
    })

    this.chain = options.chain
    this.logger = logger.withTag('mempool')
    this.metrics = options.metrics

    this.chain.onConnectBlock.on((block) => {
      this.onConnectBlock(block)
    })

    this.chain.onDisconnectBlock.on(async (block) => {
      await this.onDisconnectBlock(block)
    })
  }

  size(): number {
    return this.transactions.size
  }

  exists(transactionHash: Buffer): boolean {
    return this.transactions.has(transactionHash)
  }

  *get(): Generator<Transaction, void, unknown> {
    const clone = this.queue.clone()

    while (!clone.isEmpty()) {
      const feeAndHash = clone.poll()
      Assert.isNotUndefined(feeAndHash)
      const transaction = this.transactions.get(feeAndHash.hash)

      // The queue is cloned above, but this.transactions is not, so the
      // transaction may be removed from this.transactions while iterating.
      if (transaction === undefined) {
        continue
      }

      yield transaction
    }
  }

  /**
   * Accepts a transaction from the network
   */
  async acceptTransaction(transaction: Transaction): Promise<boolean> {
    const hash = transaction.hash()

    if (this.transactions.has(hash)) {
      return false
    }

    const { valid, reason } = await this.chain.verifier.verifyTransaction(
      transaction,
      this.chain.head,
    )

    if (!valid) {
      Assert.isNotUndefined(reason)
      this.logger.debug(`Invalid transaction '${hash.toString('hex')}': ${reason}`)
      return false
    }

    for (const spend of transaction.spends()) {
      if (this.nullifiers.has(spend.nullifier)) {
        const existingTransactionHash = this.nullifiers.get(spend.nullifier)
        Assert.isNotUndefined(existingTransactionHash)

        const existingTransaction = this.transactions.get(existingTransactionHash)
        if (!existingTransaction) {
          continue
        }

        if (transaction.fee() > existingTransaction.fee()) {
          this.deleteTransaction(existingTransaction)
        } else {
          return false
        }
      }
    }

    this.addTransaction(transaction)

    this.logger.debug(`Accepted tx ${hash.toString('hex')}, poolsize ${this.size()}`)
    return true
  }

  onConnectBlock(block: Block): void {
    let deletedTransactions = 0

    for (const transaction of block.transactions) {
      const didDelete = this.deleteTransaction(transaction)
      if (didDelete) {
        deletedTransactions++
      }
    }

    for (const transaction of this.transactions.values()) {
      const isExpired = this.chain.verifier.isExpiredSequence(
        transaction.expirationSequence(),
        this.chain.head.sequence,
      )

      if (isExpired) {
        const didDelete = this.deleteTransaction(transaction)
        if (didDelete) {
          deletedTransactions++
        }
      }
    }

    if (deletedTransactions) {
      this.logger.debug(`Deleted ${deletedTransactions} transactions`)
    }

    this.head = block.header
  }

  async onDisconnectBlock(block: Block): Promise<void> {
    let addedTransactions = 0

    for (const transaction of block.transactions) {
      const hash = transaction.hash()

      if (this.transactions.has(hash)) {
        continue
      }

      if (transaction.isMinersFee()) {
        continue
      }

      this.addTransaction(transaction)
      addedTransactions++
    }

    this.logger.debug(`Added ${addedTransactions} transactions`)

    this.head = await this.chain.getHeader(block.header.previousBlockHash)
  }

  private addTransaction(transaction: Transaction): void {
    const hash = transaction.hash()
    this.transactions.set(hash, transaction)

    for (const spend of transaction.spends()) {
      this.nullifiers.set(spend.nullifier, hash)
    }

    this.queue.add({ fee: transaction.fee(), hash })
    this.metrics.memPoolSize.value = this.size()
  }

  private deleteTransaction(transaction: Transaction): boolean {
    const hash = transaction.hash()
    this.transactions.delete(hash)

    for (const spend of transaction.spends()) {
      this.nullifiers.delete(spend.nullifier)
    }

    const entry = this.queue.removeOne((t) => t.hash.equals(hash))
    if (!entry) {
      return false
    }
    this.metrics.memPoolSize.value = this.size()
    return true
  }
}
