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

const SPEND_SERIALIZED_SIZE_IN_BYTE = 388
const NOTE_SERIALIZED_SIZE_IN_BYTE = 467

interface FeeRateEntry {
  feeRate: bigint
  blockHash: Buffer
}

export type PriorityLevel = typeof PRIORITY_LEVELS[number]
export type Percentile = typeof PRIORITY_LEVEL_PERCENTILES[number]

export const PRIORITY_LEVELS = ['low', 'medium', 'high'] as const
const PRIORITY_LEVEL_PERCENTILES = [10, 20, 30] as const
const PERCENTILES_TO_PRIORITY_LEVELS = new Map<Percentile, PriorityLevel>([
  [10, 'low'],
  [20, 'medium'],
  [30, 'high'],
])

export class FeeEstimator {
  private queues: Map<PriorityLevel, Array<FeeRateEntry>>
  readonly chain: Blockchain
  private wallet: Wallet
  private readonly logger: Logger
  private numOfRecentBlocks = 10
  private maxQueueLength: number
  private defaultFeeRate = BigInt(1)

  constructor(options: {
    wallet: Wallet
    numOfRecentBlocks?: number;
    logger?: Logger
  }) {
    this.logger = options.logger || createRootLogger().withTag('recentFeeCache')
    this.numOfRecentBlocks = options.numOfRecentBlocks ?? this.numOfRecentBlocks

    this.maxQueueLength = this.numOfRecentBlocks

    this.queues = new Map<PriorityLevel, FeeRateEntry[]>()
    PRIORITY_LEVELS.forEach((priorityLevel) => this.queues.set(priorityLevel, []))
    this.chain = options.wallet.chain
    this.wallet = options.wallet
  }

  async setUp(): Promise<void> {
    // Mempool is empty
    let currentBlockHash = this.chain.latest.hash

    for (let i = 0; i < this.numOfRecentBlocks; i++) {
      const currentBlock = await this.chain.getBlock(currentBlockHash)
      Assert.isNotNull(currentBlock, 'No block found')

      const percentileTransactions = this.getPercentileFeeRateTransactions(
        currentBlock,
        this.percentiles,
      )

      this.percentiles.forEach((percentile, i) => {
        const priorityLevel = PERCENTILES_TO_PRIORITY_LEVELS.get(percentile)

        if (priorityLevel) {
          const queue = this.queues.get(priorityLevel)

          if (queue && percentileTransactions[i] && !this.isFull(queue)) {
            queue.push({
              feeRate: getFeeRate(percentileTransactions[i]),
              blockHash: currentBlockHash,
            })
          }
        }
      })

      currentBlockHash = currentBlock.header.previousBlockHash
    }
  }

  onConnectBlock(block: Block, memPool: MemPool): void {
    const percentileTransactions = this.getPercentileFeeRateTransactions(
      block,
      this.percentiles,
      (t) => !memPool.exists(t.hash()),
    )

    this.percentiles.forEach((percentile, i) => {
      const priorityLevel = PERCENTILES_TO_PRIORITY_LEVELS.get(percentile)

      if (priorityLevel && percentileTransactions[i]) {
        const queue = this.queues.get(priorityLevel)

        if (queue && this.isFull(queue)) {
          queue.shift()
        }

        queue?.push({
          feeRate: getFeeRate(percentileTransactions[i]),
          blockHash: block.header.hash,
        })
      }
    })
  }

  onDisconnectBlock(block: Block): void {
    this.percentiles.forEach((percentile) => {
      const priorityLevel = PERCENTILES_TO_PRIORITY_LEVELS.get(percentile)

      if (priorityLevel) {
        const queue = this.queues.get(priorityLevel)

        if (queue) {
          while (queue.length > 0) {
            const lastEntry = queue[queue.length - 1]

            if (!lastEntry.blockHash.equals(block.header.hash)) {
              break
            }

            queue.pop()
          }
        }
      }
    })
  }

  private getPercentileFeeRateTransactions(
    block: Block,
    percentiles: number[],
    exclude: (transaction: Transaction) => boolean = (t) => t.isMinersFee(),
  ): Transaction[] {
    const sortedTransaction = block.transactions
      .filter((transaction) => !exclude(transaction))
      .sort((txA, txB) => Number(getFeeRate(txA) - getFeeRate(txB)))

    if (sortedTransaction.length === 0) {
      return []
    }

    return percentiles.map(
      (percentile) =>
        sortedTransaction[Math.round(((sortedTransaction.length - 1) * percentile) / 100)],
    )
  }

  estimateFeeRate(priorityLevel: PriorityLevel): bigint {
    const queue = this.queues.get(priorityLevel)
    if (queue === undefined || queue.length < this.numOfRecentBlocks) {
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
    percentile: number,
    sender: Account,
    receives: { publicAddress: string; amount: bigint; memo: string }[],
  ): Promise<bigint> {
    const estimateFeeRate = this.estimateFeeRate(percentile)
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
    return array.length === this.maxQueueLength
  }
}

export function getFeeRate(transaction: Transaction): bigint {
  const transactionSizeKb = getTransactionSize(transaction.serialize()) / 1000
  const rate = transaction.fee() / BigInt(Math.round(transactionSizeKb))

  return rate > 0 ? rate : BigInt(1)
}
