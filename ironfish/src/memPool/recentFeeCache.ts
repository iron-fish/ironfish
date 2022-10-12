/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { createRootLogger, Logger } from '../logger'
import { MemPool, PriorityQueue } from '../memPool'
import { Block, Transaction } from '../primitives'
import { Queue } from './queue'

export class RecentFeeCache {
  private queue: Queue<Transaction>
  readonly chain: Blockchain
  private readonly logger: Logger
  private numOfRecentBlocks = 10
  private numOfTxSamples = 3
  private defaultSuggestedFee = BigInt(2)

  constructor(options: {
    chain: Blockchain
    recentBlocksNum?: number
    txSampleSize?: number
    logger?: Logger
  }) {
    this.logger = options.logger || createRootLogger().withTag('recentFeeCache')
    this.numOfRecentBlocks = options.recentBlocksNum ?? this.numOfRecentBlocks
    this.numOfTxSamples = options.txSampleSize ?? this.numOfTxSamples

    this.queue = new Queue<Transaction>(this.numOfRecentBlocks * this.numOfTxSamples)
    this.chain = options.chain
  }

  async setUp(): Promise<void> {
    // Mempool is empty
    let currentBlockHash = this.chain.latest.hash

    for (let i = 0; i < this.numOfRecentBlocks; i++) {
      const currentBlock = await this.chain.getBlock(currentBlockHash)
      Assert.isNotNull(currentBlock, 'No block found')

      const lowestFeeTransactions = this.getLowestFeeTransactions(
        currentBlock,
        this.numOfTxSamples,
      )
      lowestFeeTransactions.forEach((tx) => {
        if (this.queue.isFull()) {
          return
        }
        this.queue.enqueue(tx)
      })

      currentBlockHash = currentBlock.header.previousBlockHash
    }
  }

  onConnectBlock(block: Block, memPool: MemPool): void {
    for (const transaction of this.getLowestFeeTransactions(
      block,
      this.numOfTxSamples,
      (t) => !memPool.exists(t.hash()),
    )) {
      this.addTransaction(transaction)
    }
  }

  addTransaction(transaction: Transaction): void {
    if (this.queue.isFull()) {
      this.deleteOldestTransaction()
    }

    this.queue.enqueue(transaction)
  }

  deleteOldestTransaction(): void {
    this.queue.dequeue()
  }

  private getLowestFeeTransactions(
    block: Block,
    numTransactions: number,
    exclude: (transaction: Transaction) => boolean = (t) => t.isMinersFee(),
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

    for (const transaction of block.transactions) {
      if (exclude(transaction)) {
        continue
      }

      lowestTxFees.add(transaction)
      while (lowestTxFees.size() > numTransactions) {
        lowestTxFees.poll()
      }
    }

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

    const fees: bigint[] = []
    this.queue.getAll().forEach((tx) => {
      fees.push(tx.fee())
    })

    fees.sort((a, b) => {
      if (a < b) {
        return -1
      } else if (a > b) {
        return 1
      } else {
        return 0
      }
    })

    return fees[Math.round(((this.queue.size() - 1) * percentile) / 100)]
  }

  size(): number {
    return this.queue.size()
  }
}
