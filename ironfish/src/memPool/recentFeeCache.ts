/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { createRootLogger, Logger } from '../logger'
import { MemPool, PriorityQueue } from '../memPool'
import { getTransactionSize } from '../network/utils/serializers'
import { Block, Transaction } from '../primitives'
import { BigIntUtils } from '../utils'

interface FeeRateEntry {
  feeRate: number
  blockHash: Buffer
}

export class RecentFeeCache {
  private queue: Array<FeeRateEntry>
  readonly chain: Blockchain
  private readonly logger: Logger
  private numOfRecentBlocks = 10
  private numOfTxSamples = 3
  private maxQueueLength: number
  private defaultFeeRate = 2

  constructor(options: {
    chain: Blockchain
    recentBlocksNum?: number
    txSampleSize?: number
    logger?: Logger
  }) {
    this.logger = options.logger || createRootLogger().withTag('recentFeeCache')
    this.numOfRecentBlocks = options.recentBlocksNum ?? this.numOfRecentBlocks
    this.numOfTxSamples = options.txSampleSize ?? this.numOfTxSamples

    this.maxQueueLength = this.numOfRecentBlocks * this.numOfTxSamples

    this.queue = []
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

      for (const transaction of lowestFeeTransactions) {
        if (this.isFull()) {
          break
        }
        this.queue.push({ feeRate: getFeeRate(transaction), blockHash: currentBlockHash })
      }

      currentBlockHash = currentBlock.header.previousBlockHash
    }
  }

  onConnectBlock(block: Block, memPool: MemPool): void {
    for (const transaction of this.getLowestFeeTransactions(
      block,
      this.numOfTxSamples,
      (t) => !memPool.exists(t.hash()),
    )) {
      if (this.isFull()) {
        this.queue.shift()
      }

      this.queue.push({ feeRate: getFeeRate(transaction), blockHash: block.header.hash })
    }
  }

  onDisconnectBlock(block: Block): void {
    while (this.queue.length > 0) {
      const lastEntry = this.queue[this.queue.length - 1]
      if (!lastEntry.blockHash.equals(block.header.hash)) {
        break
      }

      this.queue.pop()
    }
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

  estimateFeeRate(percentile: number): number {
    if (this.queue.length < this.numOfRecentBlocks) {
      return this.defaultFeeRate
    }

    const fees: number[] = []
    for (const entry of this.queue) {
      fees.push(entry.feeRate)
    }

    fees.sort((a, b) => a - b)

    return fees[Math.round(((this.queue.length - 1) * percentile) / 100)]
  }

  size(): number {
    return this.queue.length
  }

  private isFull(): boolean {
    return this.queue.length === this.maxQueueLength
  }
}

export function getFeeRate(transaction: Transaction): number {
  return BigIntUtils.divide(
    transaction.fee(),
    BigInt(getTransactionSize(transaction.serialize())),
  )
}
