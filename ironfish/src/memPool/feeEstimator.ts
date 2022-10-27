/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { createRootLogger, Logger } from '../logger'
import { MemPool } from '../memPool'
import { getTransactionSize } from '../network/utils/serializers'
import { Block, Transaction } from '../primitives'
import { Wallet } from '../wallet'
import { Account } from '../wallet/account'

export interface FeeRateEntry {
  feeRate: bigint
  blockHash: Buffer
}

export type PriorityLevel = typeof PRIORITY_LEVELS[number]
export type Percentile = typeof PRIORITY_LEVEL_PERCENTILES[number]

export const PRIORITY_LEVELS = ['low', 'medium', 'high'] as const
const PRIORITY_LEVEL_PERCENTILES = [10, 20, 30] as const
const PRIORITY_LEVELS_TO_PERCENTILES = new Map<PriorityLevel, Percentile>([
  ['low', 10],
  ['medium', 20],
  ['high', 30],
])
const SPEND_SERIALIZED_SIZE_IN_BYTE = 388
const NOTE_SERIALIZED_SIZE_IN_BYTE = 467

export class FeeEstimator {
  private queues: Map<PriorityLevel, Array<FeeRateEntry>>
  private wallet: Wallet
  private readonly logger: Logger
  private maxBlockHistory = 10
  private defaultFeeRate = BigInt(1)
  private readonly percentiles = PRIORITY_LEVEL_PERCENTILES.map((x) => x)

  constructor(options: { wallet: Wallet; maxBlockHistory?: number; logger?: Logger }) {
    this.logger = options.logger || createRootLogger().withTag('recentFeeCache')
    this.maxBlockHistory = options.maxBlockHistory ?? this.maxBlockHistory

    this.queues = new Map<PriorityLevel, FeeRateEntry[]>()
    PRIORITY_LEVELS.forEach((priorityLevel) => this.queues.set(priorityLevel, []))
    this.wallet = options.wallet
  }

  async init(chain: Blockchain): Promise<void> {
    if (chain.isEmpty) {
      return
    }

    let currentBlockHash = chain.latest.hash

    for (let i = 0; i < this.maxBlockHistory; i++) {
      const currentBlock = await chain.getBlock(currentBlockHash)
      Assert.isNotNull(currentBlock, 'No block found')

      const feeRateEntryList = this.getPercentileFeeRateEntries(currentBlock, this.percentiles)

      for (const [priorityLevel, queue] of this.queues) {
        let percentile: Percentile | undefined
        if ((percentile = PRIORITY_LEVELS_TO_PERCENTILES.get(priorityLevel))) {
          const feeRateEntry = feeRateEntryList.get(percentile)

          if (feeRateEntry && !this.isFull(queue)) {
            queue.push(feeRateEntry)
          }
        }
      }

      if (currentBlockHash.equals(chain.genesis.hash)) {
        break
      }

      currentBlockHash = currentBlock.header.previousBlockHash
    }

    this.queues.forEach((queue) => queue.reverse())
  }

  onConnectBlock(block: Block, memPool: MemPool): void {
    const feeRateEntryList = this.getPercentileFeeRateEntries(
      block,
      this.percentiles,
      (t) => !memPool.exists(t.hash()),
    )

    for (const [priorityLevel, queue] of this.queues) {
      let percentile: Percentile | undefined
      if ((percentile = PRIORITY_LEVELS_TO_PERCENTILES.get(priorityLevel))) {
        let feeRateEntry: FeeRateEntry | undefined
        if ((feeRateEntry = feeRateEntryList.get(percentile))) {
          if (this.isFull(queue)) {
            queue.shift()
          }
          queue.push(feeRateEntry)
        }
      }
    }
  }

  onDisconnectBlock(block: Block): void {
    for (const [_, queue] of this.queues) {
      while (queue.length > 0) {
        const lastEntry = queue[queue.length - 1]

        if (!lastEntry.blockHash.equals(block.header.hash)) {
          break
        }

        queue.pop()
      }
    }
  }

  private getPercentileFeeRateEntries(
    block: Block,
    percentiles: Percentile[],
    exclude: (transaction: Transaction) => boolean = (t) => t.isMinersFee(),
  ): Map<Percentile, FeeRateEntry> {
    const sortedTransaction = block.transactions
      .filter((transaction) => !exclude(transaction))
      .sort((txA, txB) => Number(getFeeRate(txA) - getFeeRate(txB)))

    if (sortedTransaction.length === 0) {
      return new Map()
    }

    const result = new Map<Percentile, FeeRateEntry>()

    for (const percentile of percentiles) {
      const transaction =
        sortedTransaction[Math.round(((sortedTransaction.length - 1) * percentile) / 100)]
      result.set(percentile, {
        feeRate: getFeeRate(transaction),
        blockHash: block.header.hash,
      })
    }

    return result
  }

  estimateFeeRates(): { low: bigint; medium: bigint; high: bigint } {
    return {
      low: this.estimateFeeRate('low'),
      medium: this.estimateFeeRate('medium'),
      high: this.estimateFeeRate('high'),
    }
  }

  estimateFeeRate(priorityLevel: PriorityLevel): bigint {
    const queue = this.queues.get(priorityLevel)
    if (queue === undefined || queue.length < this.maxBlockHistory) {
      return this.defaultFeeRate
    }

    const fees: bigint[] = []
    for (const entry of queue) {
      fees.push(entry.feeRate)
    }

    fees.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

    return fees[Math.round((queue.length - 1) / 2)]
  }

  size(priorityLevel: PriorityLevel): number | undefined {
    return this.queues.get(priorityLevel)?.length
  }

  async estimateFee(
    priorityLevel: PriorityLevel,
    sender: Account,
    receives: { publicAddress: string; amount: bigint; memo: string }[],
  ): Promise<bigint> {
    const estimateFeeRate = this.estimateFeeRate(priorityLevel)
    const estimateTransactionSize = await this.getPendingTransactionSize(
      sender,
      receives,
      estimateFeeRate,
    )
    return estimateFeeRate * BigInt(estimateTransactionSize)
  }

  private async getPendingTransactionSize(
    sender: Account,
    receives: { publicAddress: string; amount: bigint; memo: string }[],
    estimateFeeRate?: bigint,
  ): Promise<number> {
    let size = 0
    size += 8 // spends length
    size += 8 // notes length
    size += 8 // fee
    size += 4 // expiration
    size += 64 // signature

    const amountNeeded = receives.reduce((acc, receive) => acc + receive.amount, BigInt(0))

    const { amount, notesToSpend } = await this.wallet.createSpends(sender, amountNeeded)

    size += notesToSpend.length * SPEND_SERIALIZED_SIZE_IN_BYTE

    size += receives.length * NOTE_SERIALIZED_SIZE_IN_BYTE

    if (estimateFeeRate) {
      const additionalAmountNeeded =
        estimateFeeRate * BigInt(Math.ceil(size / 1000)) - (amount - amountNeeded)

      if (additionalAmountNeeded > 0) {
        const { notesToSpend: additionalNotesToSpend } = await this.wallet.createSpends(
          sender,
          additionalAmountNeeded,
        )
        const additionalSpendsLength =
          additionalNotesToSpend.length * SPEND_SERIALIZED_SIZE_IN_BYTE
        size += additionalSpendsLength
      }
    }

    return Math.ceil(size / 1000)
  }

  private isFull(array: FeeRateEntry[]): boolean {
    return array.length === this.maxBlockHistory
  }
}

export function getFeeRate(transaction: Transaction): bigint {
  const transactionSizeKb = getTransactionSize(transaction.serialize()) / 1000
  const rate = transaction.fee() / BigInt(Math.round(transactionSizeKb))

  return rate > 0 ? rate : BigInt(1)
}
