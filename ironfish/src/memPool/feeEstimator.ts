/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { createRootLogger, Logger } from '../logger'
import { MemPool } from '../memPool'
import { getTransactionSize } from '../network/utils/serializers'
import { Block, Transaction } from '../primitives'
import { NOTE_ENCRYPTED_SERIALIZED_SIZE_IN_BYTE } from '../primitives/noteEncrypted'
import { SPEND_SERIALIZED_SIZE_IN_BYTE } from '../primitives/spend'
import { BigIntUtils } from '../utils'
import { Wallet } from '../wallet'
import { Account } from '../wallet/account'

export interface FeeRateEntry {
  feeRate: bigint
  blockHash: Buffer
}

export type PriorityLevel = typeof PRIORITY_LEVELS[number]
export type PriorityLevelPercentiles = { low: number; medium: number; high: number }

export const PRIORITY_LEVELS = ['low', 'medium', 'high'] as const
const DEFAULT_PRIORITY_LEVEL_PERCENTILES = { low: 10, medium: 20, high: 30 }

export class FeeEstimator {
  private queues: { low: FeeRateEntry[]; medium: FeeRateEntry[]; high: FeeRateEntry[] }
  private percentiles: PriorityLevelPercentiles
  private wallet: Wallet
  private readonly logger: Logger
  private maxBlockHistory = 10
  private defaultFeeRate = BigInt(1)

  constructor(options: {
    wallet: Wallet
    maxBlockHistory?: number
    logger?: Logger
    percentiles?: PriorityLevelPercentiles
  }) {
    this.logger = options.logger || createRootLogger().withTag('recentFeeCache')
    this.maxBlockHistory = options.maxBlockHistory ?? this.maxBlockHistory

    this.queues = { low: [], medium: [], high: [] }
    this.percentiles = options.percentiles ?? DEFAULT_PRIORITY_LEVEL_PERCENTILES
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

      const sortedFeeRates = this.getTransactionFeeRates(currentBlock)

      for (const priorityLevel of PRIORITY_LEVELS) {
        const queue = this.queues[priorityLevel]
        const percentile = this.percentiles[priorityLevel]
        const feeRate = getPercentileEntry(sortedFeeRates, percentile)

        if (feeRate !== undefined && !this.isFull(queue)) {
          queue.push({ feeRate, blockHash: currentBlock.header.hash })
        }
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
        if (this.isFull(queue)) {
          queue.shift()
        }

        queue.push({ feeRate, blockHash: block.header.hash })
      }
    }
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

  estimateFeeRates(): { low: bigint; medium: bigint; high: bigint } {
    return {
      low: this.estimateFeeRate('low'),
      medium: this.estimateFeeRate('medium'),
      high: this.estimateFeeRate('high'),
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

    return fees[Math.round((queue.length - 1) / 2)]
  }

  size(priorityLevel: PriorityLevel): number | undefined {
    return this.queues[priorityLevel].length
  }

  async estimateFees(
    sender: Account,
    receives: { publicAddress: string; amount: bigint; memo: string }[],
  ): Promise<{ low: bigint; medium: bigint; high: bigint }> {
    const pendingTransaction = await this.getPendingTransaction(sender, receives)

    const feeRates = this.estimateFeeRates()

    return {
      low: this.getPendingTransactionFee(feeRates.low, pendingTransaction),
      medium: this.getPendingTransactionFee(feeRates.medium, pendingTransaction),
      high: this.getPendingTransactionFee(feeRates.high, pendingTransaction),
    }
  }

  async estimateFee(
    priorityLevel: PriorityLevel,
    sender: Account,
    receives: { publicAddress: string; amount: bigint; memo: string }[],
  ): Promise<bigint> {
    const feeRate = this.estimateFeeRate(priorityLevel)

    const pendingTransaction = await this.getPendingTransaction(sender, receives)

    return this.getPendingTransactionFee(feeRate, pendingTransaction)
  }

  private async getPendingTransaction(
    sender: Account,
    receives: { publicAddress: string; amount: bigint; memo: string }[],
  ): Promise<{ size: number; spenderChange: bigint }> {
    let size = 0
    size += 8 // spends length
    size += 8 // notes length
    size += 8 // fee
    size += 4 // expiration
    size += 64 // signature

    const amountNeeded = receives.reduce((acc, receive) => acc + receive.amount, BigInt(0))

    const { amount, notesToSpend } = await this.wallet.createSpends(sender, amountNeeded)

    size += notesToSpend.length * SPEND_SERIALIZED_SIZE_IN_BYTE

    size += receives.length * NOTE_ENCRYPTED_SERIALIZED_SIZE_IN_BYTE

    const spenderChange = amount - amountNeeded

    return { size, spenderChange }
  }

  private getPendingTransactionFee(
    feeRate: bigint,
    pendingTransaction: { size: number; spenderChange: bigint },
  ): bigint {
    const { size, spenderChange } = pendingTransaction

    const pendingFee = this.getFee(feeRate, size)

    if (spenderChange >= pendingFee) {
      // sender will receive a note with the remainder in change
      // unless that note makes the fee more expensive than the change received
      return BigIntUtils.min(
        spenderChange,
        this.getFee(feeRate, size + NOTE_ENCRYPTED_SERIALIZED_SIZE_IN_BYTE),
      )
    } else {
      // paying the fee will require at least one more spend
      // calculate fee for only one more spend (and change) to avoid recursively checking notes
      return this.getFee(
        feeRate,
        size + SPEND_SERIALIZED_SIZE_IN_BYTE + NOTE_ENCRYPTED_SERIALIZED_SIZE_IN_BYTE,
      )
    }
  }

  private isFull(array: FeeRateEntry[]): boolean {
    return array.length === this.maxBlockHistory
  }

  private getFee(feeRate: bigint, transactionSize: number): bigint {
    const fee = (feeRate * BigInt(transactionSize)) / BigInt(1000)

    return fee > BigInt(0) ? fee : BigInt(1)
  }
}

export function getFeeRate(transaction: Transaction): bigint {
  const rate =
    (transaction.fee() * BigInt(1000)) / BigInt(getTransactionSize(transaction.serialize()))

  return rate > 0 ? rate : BigInt(1)
}

function getPercentileEntry<T>(sortedList: T[], percentile: number): T | undefined {
  return sortedList[Math.round(((sortedList.length - 1) * percentile) / 100)]
}
