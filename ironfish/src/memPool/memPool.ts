/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { isExpiredSequence } from '../consensus'
import { createRootLogger, Logger } from '../logger'
import { MetricsMonitor } from '../metrics'
import { getTransactionSize } from '../network/utils/serializers'
import { Block, BlockHeader } from '../primitives'
import { Transaction, TransactionHash } from '../primitives/transaction'
import { FeeEstimator, getFeeRate } from './feeEstimator'
import { PriorityQueue } from './priorityQueue'

interface MempoolEntry {
  hash: TransactionHash
  feeRate: bigint
}

interface ExpirationMempoolEntry {
  expiration: number
  hash: TransactionHash
}

export class MemPool {
  private readonly transactions = new BufferMap<Transaction>()
  /* Keep track of number of bytes stored in the transaction map */
  private transactionsBytes = 0
  private readonly nullifiers = new BufferMap<Buffer>()

  private readonly queue: PriorityQueue<MempoolEntry>
  private readonly expirationQueue: PriorityQueue<ExpirationMempoolEntry>

  head: BlockHeader | null

  private readonly chain: Blockchain
  private readonly logger: Logger
  private readonly metrics: MetricsMonitor

  readonly feeEstimator: FeeEstimator

  constructor(options: {
    chain: Blockchain
    feeEstimator: FeeEstimator
    metrics: MetricsMonitor
    logger?: Logger
  }) {
    const logger = options.logger || createRootLogger()

    this.head = null

    this.queue = new PriorityQueue<MempoolEntry>(
      (firstTransaction, secondTransaction) => {
        if (firstTransaction.feeRate !== secondTransaction.feeRate) {
          return firstTransaction.feeRate > secondTransaction.feeRate
        }

        return firstTransaction.hash.compare(secondTransaction.hash) > 0
      },
      (t) => t.hash.toString('hex'),
    )

    this.expirationQueue = new PriorityQueue<ExpirationMempoolEntry>(
      (t1, t2) => t1.expiration < t2.expiration,
      (t) => t.hash.toString('hex'),
    )

    this.chain = options.chain
    this.logger = logger.withTag('mempool')
    this.metrics = options.metrics

    this.feeEstimator = options.feeEstimator

    this.chain.onConnectBlock.on((block) => {
      this.feeEstimator.onConnectBlock(block, this)
      this.onConnectBlock(block)
    })

    this.chain.onDisconnectBlock.on(async (block) => {
      this.feeEstimator.onDisconnectBlock(block)
      await this.onDisconnectBlock(block)
    })
  }

  async start(): Promise<void> {
    await this.feeEstimator.init(this.chain)
  }

  count(): number {
    return this.transactions.size
  }

  sizeBytes(): number {
    return this.transactionsBytes
  }

  exists(hash: TransactionHash): boolean {
    return this.transactions.has(hash)
  }

  /*
   * Returns a transaction if the transaction with that hash exists in the mempool
   * Otherwise, returns undefined
   */
  get(hash: TransactionHash): Transaction | undefined {
    return this.transactions.get(hash)
  }

  *orderedTransactions(): Generator<Transaction, void, unknown> {
    const clone = this.queue.clone()

    while (clone.size() > 0) {
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
  acceptTransaction(transaction: Transaction): boolean {
    const hash = transaction.hash().toString('hex')
    const sequence = transaction.expiration()
    if (this.exists(transaction.hash())) {
      return false
    }

    if (isExpiredSequence(sequence, this.chain.head.sequence)) {
      this.logger.debug(`Invalid transaction '${hash}': expired sequence ${sequence}`)
      return false
    }

    for (const spend of transaction.spends) {
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

    this.logger.debug(`Accepted tx ${hash}, poolsize ${this.count()}`)
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

    let nextExpired = this.expirationQueue.peek()
    while (nextExpired && isExpiredSequence(nextExpired.expiration, this.chain.head.sequence)) {
      const transaction = this.get(nextExpired.hash)
      if (!transaction) {
        continue
      }

      const didDelete = this.deleteTransaction(transaction)
      if (didDelete) {
        deletedTransactions++
      }

      nextExpired = this.expirationQueue.peek()
    }

    if (deletedTransactions) {
      this.logger.debug(`Deleted ${deletedTransactions} transactions`)
    }

    this.head = block.header
  }

  async onDisconnectBlock(block: Block): Promise<void> {
    let addedTransactions = 0

    for (const transaction of block.transactions) {
      if (transaction.isMinersFee()) {
        continue
      }

      const added = this.addTransaction(transaction)
      if (added) {
        addedTransactions++
      }
    }

    this.logger.debug(`Added ${addedTransactions} transactions`)

    this.head = await this.chain.getHeader(block.header.previousBlockHash)
  }

  private addTransaction(transaction: Transaction): boolean {
    const hash = transaction.hash()

    if (this.transactions.has(hash)) {
      return false
    }

    this.transactions.set(hash, transaction)

    this.transactionsBytes += getTransactionSize(transaction)

    for (const spend of transaction.spends) {
      if (!this.nullifiers.has(spend.nullifier)) {
        this.nullifiers.set(spend.nullifier, hash)
      }
    }

    this.queue.add({ hash, feeRate: getFeeRate(transaction) })
    this.expirationQueue.add({ expiration: transaction.expiration(), hash })
    this.metrics.memPoolSize.value = this.count()
    return true
  }

  private deleteTransaction(transaction: Transaction): boolean {
    const hash = transaction.hash()
    const deleted = this.transactions.delete(hash)

    if (!deleted) {
      return false
    }

    this.transactionsBytes -= getTransactionSize(transaction)

    for (const spend of transaction.spends) {
      this.nullifiers.delete(spend.nullifier)
    }

    this.queue.remove(hash.toString('hex'))
    this.expirationQueue.remove(hash.toString('hex'))

    this.metrics.memPoolSize.value = this.count()
    return true
  }
}
