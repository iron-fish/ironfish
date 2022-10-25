/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { createRootLogger, Logger } from '../logger'
import { MemPool, PriorityQueue } from '../memPool'
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

export class FeeEstimator {
  private queue: Array<FeeRateEntry>
  readonly chain: Blockchain
  private wallet: Wallet
  private readonly logger: Logger
  private numOfRecentBlocks = 10
  private numOfTxSamples = 3
  private maxQueueLength: number
  private defaultFeeRate = BigInt(1)

  constructor(options: {
    wallet: Wallet
    recentBlocksNum?: number
    txSampleSize?: number
    logger?: Logger
  }) {
    this.logger = options.logger || createRootLogger().withTag('recentFeeCache')
    this.numOfRecentBlocks = options.recentBlocksNum ?? this.numOfRecentBlocks
    this.numOfTxSamples = options.txSampleSize ?? this.numOfTxSamples

    this.maxQueueLength = this.numOfRecentBlocks * this.numOfTxSamples

    this.queue = []
    this.chain = options.wallet.chain
    this.wallet = options.wallet
  }

  async setUp(): Promise<void> {
    // Mempool is empty
    let currentBlockHash = this.chain.latest.hash

    for (let i = 0; i < this.numOfRecentBlocks; i++) {
      const currentBlock = await this.chain.getBlock(currentBlockHash)
      Assert.isNotNull(currentBlock, 'No block found')

      const lowestFeeTransactions = this.getLowestFeeRateTransactions(
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
    for (const transaction of this.getLowestFeeRateTransactions(
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

  private getLowestFeeRateTransactions(
    block: Block,
    numTransactions: number,
    exclude: (transaction: Transaction) => boolean = (t) => t.isMinersFee(),
  ): Transaction[] {
    const lowestTxFees = new PriorityQueue<Transaction>(
      (txA, txB) => getFeeRate(txA) > getFeeRate(txB),
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

  estimateFeeRate(percentile: number): bigint {
    if (this.queue.length < this.numOfRecentBlocks) {
      return this.defaultFeeRate
    }

    const fees: bigint[] = []
    for (const entry of this.queue) {
      fees.push(entry.feeRate)
    }

    fees.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

    return fees[Math.round(((this.queue.length - 1) * percentile) / 100)]
  }

  size(): number {
    return this.queue.length
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
      const additionalAmountNeeded = amount - estimateFeeRate * BigInt(Math.ceil(size / 1000))
      const { notesToSpend: additionalNotesToSpend } = await this.wallet.createSpends(
        sender,
        additionalAmountNeeded,
      )
      const additionalSpendsLength =
        additionalNotesToSpend.length * SPEND_SERIALIZED_SIZE_IN_BYTE
      size += additionalSpendsLength
    }

    return Math.ceil(size / 1000)
  }

  private isFull(): boolean {
    return this.queue.length === this.maxQueueLength
  }
}

export function getFeeRate(transaction: Transaction): bigint {
  const transactionSizeKb = getTransactionSize(transaction.serialize()) / 1000
  const rate = transaction.fee() / BigInt(Math.round(transactionSizeKb))

  return rate > 0 ? rate : BigInt(1)
}
