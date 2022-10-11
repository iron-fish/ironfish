/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { createRootLogger, Logger } from '../logger'
import { PriorityQueue } from '../memPool'
import { MetricsMonitor } from '../metrics'
import { Block, Transaction } from '../primitives'
import { Queue } from './queue'

export class RecentFeeCache {
  private queue: Queue<Transaction>
  readonly chain: Blockchain
  private readonly logger: Logger
  private readonly metrics: MetricsMonitor
  private numOfRecentBlocks = 10
  private numOfTxSamples = 3
  private defaultSuggestedFee = BigInt(2)

  constructor(
    chain: Blockchain,
    recentBlocksNum?: number,
    txSampleSize?: number,
    metrics?: MetricsMonitor,
    logger?: Logger,
  ) {
    this.logger = logger || createRootLogger()
    this.numOfRecentBlocks = recentBlocksNum ?? this.numOfRecentBlocks
    this.numOfTxSamples = txSampleSize ?? this.numOfTxSamples

    this.queue = new Queue<Transaction>(this.numOfRecentBlocks * this.numOfTxSamples)
    this.chain = chain
    this.logger.withTag('recentFeeCache')
    this.metrics = metrics || new MetricsMonitor({ logger: this.logger })
  }

  async setUpCache(): Promise<void> {
    // Mempool is empty
    let currentBlockHash = this.chain.latest.hash

    for (let i = 0; i < this.numOfRecentBlocks; i++) {
      const currentBlock = await this.chain.getBlock(currentBlockHash)
      Assert.isNotNull(currentBlock, 'No block found')

      const lowestFeeTransactions = this.getLowestFeeTransactions(currentBlock)
      lowestFeeTransactions.forEach((tx) => {
        if (this.queue.isFull()) {
          return
        }
        this.queue.enqueue(tx)
      })

      currentBlockHash = currentBlock.header.previousBlockHash
    }
  }

  /**
   * Add recent transactions to fee cache
   */

  addFee(transaction: Transaction): boolean {
    if (this.queue.isFull()) {
      this.deleteOldestTransaction()
    }
    try {
      this.queue.enqueue(transaction)
      return true
    } catch {
      this.logger.error(`Error enqueue transaction to Recent Fee Cache`)
      return false
    }
  }

  /**
   * Delete the least recent transactions from fee cache
   */
  deleteOldestTransaction(): void {
    this.queue.dequeue()
  }

  getLowestFeeTransactions(
    block: Block,
    numOfTransactions?: number | undefined,
  ): Transaction[] {
    const lowestTxFees = new PriorityQueue<Transaction>(
      // TODO: @yajun compare transaction fee rate per byte when transaction size is available
      (txA, txB) => {
        if (txA.fee() === txB.fee()) {
          return txA.hash().compare(txB.hash()) > 0
        }
        return txA.fee() > txB.fee()
      },
      (t) => t.hash().toString('hex'),
    )
    const size = numOfTransactions ?? this.numOfTxSamples

    block.transactions.forEach((transaction) => {
      lowestTxFees.add(transaction)
      while (lowestTxFees.size() > size) {
        lowestTxFees.poll()
      }
    })

    const transactions: Transaction[] = []

    while (lowestTxFees.size() > 0) {
      const transaction = lowestTxFees.poll()
      if (transaction) {
        transactions.push(transaction)
      }
    }

    return transactions.reverse()
  }

  getSuggestedFee(percentile: number): bigint {
    if (this.queue.size() < this.numOfRecentBlocks) {
      return this.defaultSuggestedFee
    }

    const transaction = this.queue.get(Math.round(((this.queue.size() - 1) * percentile) / 100))
    if (!transaction) {
      return this.defaultSuggestedFee
    }
    return transaction.fee()
  }

  getCacheSize(): number {
    return this.queue.size()
  }
}
