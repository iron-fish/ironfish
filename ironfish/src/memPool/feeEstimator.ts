/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Decimal from 'decimal.js'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { Consensus } from '../consensus'
import { createRootLogger, Logger } from '../logger'
import { MemPool } from '../memPool'
import { getTransactionSize } from '../network/utils/serializers'
import { getBlockSize } from '../network/utils/serializers'
import { Block, Transaction } from '../primitives'

export interface FeeRateEntry {
  feeRate: bigint
  blockHash: Buffer
}

export interface BlockSizeEntry {
  blockSize: number
  blockHash: Buffer
}

export type PriorityLevel = typeof PRIORITY_LEVELS[number]
export type PriorityLevelPercentiles = { slow: number; average: number; fast: number }

export const PRIORITY_LEVELS = ['slow', 'average', 'fast'] as const
export const BLOCK_SIZE = 'blockSize' as const
const DEFAULT_PRIORITY_LEVEL_PERCENTILES = { slow: 10, average: 20, fast: 30 }

export class FeeEstimator {
  private queues: {
    slow: FeeRateEntry[]
    average: FeeRateEntry[]
    fast: FeeRateEntry[]
    blockSize: BlockSizeEntry[]
  }
  private percentiles: PriorityLevelPercentiles
  private readonly logger: Logger
  private maxBlockHistory = 10
  private defaultFeeRate = BigInt(1)
  readonly minFeeRate: bigint
  private consensus: Consensus

  constructor(options: {
    consensus: Consensus
    maxBlockHistory?: number
    minFeeRate?: bigint
    logger?: Logger
    percentiles?: PriorityLevelPercentiles
  }) {
    this.logger = (options.logger ?? createRootLogger()).withTag('recentFeeCache')
    this.maxBlockHistory = options.maxBlockHistory ?? this.maxBlockHistory
    this.consensus = options.consensus

    this.minFeeRate = options.minFeeRate ?? 1n

    this.queues = { slow: [], average: [], fast: [], blockSize: [] }
    this.percentiles = options.percentiles ?? DEFAULT_PRIORITY_LEVEL_PERCENTILES
  }

  async init(chain: Blockchain): Promise<void> {
    if (chain.isEmpty) {
      return
    }

    let currentBlockHash = chain.head.hash

    for (let i = 0; i < this.maxBlockHistory; i++) {
      const currentBlock = await chain.getBlock(currentBlockHash)
      Assert.isNotNull(currentBlock, 'No block found')

      const sortedFeeRates = this.getTransactionFeeRates(currentBlock)

      // construct fee rate cache
      for (const priorityLevel of PRIORITY_LEVELS) {
        const queue = this.queues[priorityLevel]
        const percentile = this.percentiles[priorityLevel]
        const feeRate = getPercentileEntry(sortedFeeRates, percentile)

        if (feeRate !== undefined && !this.isFull(queue.length)) {
          queue.push({ feeRate, blockHash: currentBlock.header.hash })
        }
      }

      // construct block size cache
      if (!this.isFull(this.queues[BLOCK_SIZE].length)) {
        const blockSize = getBlockSize(currentBlock)
        this.queues[BLOCK_SIZE].push({ blockSize, blockHash: currentBlock.header.hash })
      }

      if (currentBlockHash.equals(chain.genesis.hash)) {
        break
      }

      currentBlockHash = currentBlock.header.previousBlockHash
    }

    PRIORITY_LEVELS.forEach((priorityLevel) => this.queues[priorityLevel].reverse())
  }

  onConnectBlock(block: Block, memPool: MemPool): void {
    const sortedFeeRates = this.getTransactionFeeRates(block, (t) => !memPool.exists(t.hash()))

    for (const priorityLevel of PRIORITY_LEVELS) {
      const queue = this.queues[priorityLevel]
      const percentile = this.percentiles[priorityLevel]

      const feeRate = getPercentileEntry(sortedFeeRates, percentile)

      if (feeRate !== undefined) {
        if (this.isFull(queue.length)) {
          queue.shift()
        }

        queue.push({ feeRate, blockHash: block.header.hash })
      }
    }

    const blockSize = getBlockSize(block)

    const queue = this.queues[BLOCK_SIZE]
    if (this.isFull(queue.length)) {
      queue.shift()
    }

    this.queues[BLOCK_SIZE].push({ blockSize, blockHash: block.header.hash })
  }

  onDisconnectBlock(block: Block): void {
    for (const priorityLevel of PRIORITY_LEVELS) {
      const queue = this.queues[priorityLevel]

      while (queue.length > 0) {
        const lastEntry = queue[queue.length - 1]

        if (!lastEntry.blockHash.equals(block.header.hash)) {
          break
        }

        queue.pop()
      }
    }

    const queue = this.queues[BLOCK_SIZE]

    while (queue.length > 0) {
      const lastEntry = queue[queue.length - 1]

      if (!lastEntry.blockHash.equals(block.header.hash)) {
        break
      }

      queue.pop()
    }
  }

  private getTransactionFeeRates(
    block: Block,
    exclude: (transaction: Transaction) => boolean = (t) => t.isMinersFee(),
  ): bigint[] {
    const feeRates = []

    for (const transaction of block.transactions) {
      if (!exclude(transaction)) {
        feeRates.push(getFeeRate(transaction))
      }
    }

    return feeRates.sort((a, b) => (a > b ? 1 : -1))
  }

  estimateFeeRates(): { slow: bigint; average: bigint; fast: bigint } {
    return {
      slow: this.estimateFeeRate('slow'),
      average: this.estimateFeeRate('average'),
      fast: this.estimateFeeRate('fast'),
    }
  }

  /*
   * returns an estimated fee rate as ore/kb
   */
  estimateFeeRate(priorityLevel: PriorityLevel): bigint {
    const queue = this.queues[priorityLevel]

    if (queue.length < this.maxBlockHistory) {
      return this.defaultFeeRate
    }

    const fees: bigint[] = []
    for (const entry of queue) {
      fees.push(entry.feeRate)
    }

    fees.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    const averageBlockSize =
      this.queues[BLOCK_SIZE].reduce((a, b) => a + b.blockSize, 0) /
      this.queues[BLOCK_SIZE].length

    const maxBlockSizeBytes = this.consensus.parameters.maxBlockSizeBytes
    const blockSizeRatio = BigInt(Math.round((averageBlockSize / maxBlockSizeBytes) * 100))

    let feeRate = fees[Math.round((queue.length - 1) / 2)]
    feeRate = (feeRate * blockSizeRatio) / 100n

    if (feeRate < this.minFeeRate) {
      feeRate = this.minFeeRate
    }

    return feeRate
  }

  size(priorityLevel: PriorityLevel): number | undefined {
    return this.queues[priorityLevel].length
  }

  private isFull(arrayLength: number): boolean {
    return arrayLength === this.maxBlockHistory
  }
}

export function getFee(feeRate: bigint, transactionSize: number): bigint {
  const fee = (feeRate * BigInt(transactionSize)) / BigInt(1000)

  return fee > BigInt(0) ? fee : BigInt(1)
}

export function getFeeRate(transaction: Transaction): bigint {
  const rate = (transaction.fee() * BigInt(1000)) / BigInt(getTransactionSize(transaction))

  return rate > 0 ? rate : BigInt(1)
}

export function getPreciseFeeRate(transaction: Transaction): Decimal {
  const kb = new Decimal(getTransactionSize(transaction) / 1000)
  const fee = new Decimal(transaction.fee().toString())

  return fee.dividedBy(kb)
}

function getPercentileEntry<T>(sortedList: T[], percentile: number): T | undefined {
  return sortedList[Math.round(((sortedList.length - 1) * percentile) / 100)]
}
