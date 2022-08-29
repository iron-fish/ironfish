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
  private readonly transactions = new BufferMap<Transaction>()
  /* Keep track of number of bytes stored in the transaction map */
  private transactionsBytes = 0
  private readonly nullifiers = new BufferMap<Buffer>()
  /* Keep track of number of bytes stored in the nullifiers map */
  private nullifiersBytes = 0
  private readonly queue: FastPriorityQueue<MempoolEntry>
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

  sizeBytes(): number {
    const queueSize = this.queue.size * (32 + 8) // estimate the queue size hash (32b) fee (8b)
    return this.transactionsBytes + this.nullifiersBytes + queueSize
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
  acceptTransaction(transaction: Transaction): boolean {
    const hash = transaction.hash().toString('hex')
    const sequence = transaction.expirationSequence()

    if (this.exists(transaction.hash())) {
      return false
    }

    const isExpiredSequence = this.chain.verifier.isExpiredSequence(
      sequence,
      this.chain.head.sequence,
    )

    if (isExpiredSequence) {
      this.logger.debug(`Invalid transaction '${hash}': expired sequence ${sequence}`)
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

    this.logger.debug(`Accepted tx ${hash}, poolsize ${this.size()}`)
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
      if (this.exists(transaction.hash())) {
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
    if (!this.transactions.has(hash)) {
      this.transactions.set(hash, transaction)
      this.transactionsBytes += transaction.serialize().byteLength + hash.byteLength
    }

    for (const spend of transaction.spends()) {
      if (!this.nullifiers.has(spend.nullifier)) {
        this.nullifiers.set(spend.nullifier, hash)
        this.nullifiersBytes += spend.nullifier.byteLength + hash.byteLength
      }
    }

    this.queue.add({ fee: transaction.fee(), hash })
    this.metrics.memPoolSize.value = this.size()
  }

  private deleteTransaction(transaction: Transaction): boolean {
    const hash = transaction.hash()
    if (this.transactions.delete(hash)) {
      this.transactionsBytes -= transaction.serialize().byteLength + hash.byteLength
    }

    for (const spend of transaction.spends()) {
      if (this.nullifiers.delete(spend.nullifier)) {
        this.nullifiersBytes -= spend.nullifier.byteLength + hash.byteLength
      }
    }

    const entry = this.queue.removeOne((t) => t.hash.equals(hash))
    if (!entry) {
      return false
    }
    this.metrics.memPoolSize.value = this.size()
    return true
  }
}
