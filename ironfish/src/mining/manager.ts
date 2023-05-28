/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferSet } from 'buffer-map'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { isExpiredSequence } from '../consensus'
import { Event } from '../event'
import { MemPool } from '../memPool'
import { MetricsMonitor } from '../metrics'
import {
  getBlockSize,
  getBlockWithMinersFeeSize,
  getTransactionSize,
  MINERS_FEE_TRANSACTION_SIZE_BYTES,
} from '../network/utils/serializers'
import { IronfishNode } from '../node'
import { Block } from '../primitives/block'
import { isBlockHeavier } from '../primitives/blockheader'
import { Transaction } from '../primitives/transaction'
import { BlockTemplateSerde, SerializedBlockTemplate } from '../serde'
import { BenchUtils } from '../utils/bench'
import { GraffitiUtils } from '../utils/graffiti'

export enum MINED_RESULT {
  UNKNOWN_REQUEST = 'UNKNOWN_REQUEST',
  CHAIN_CHANGED = 'CHAIN_CHANGED',
  INVALID_BLOCK = 'INVALID_BLOCK',
  ADD_FAILED = 'ADD_FAILED',
  FORK = 'FORK',
  SUCCESS = 'SUCCESS',
}

export class MiningManager {
  private readonly chain: Blockchain
  private readonly memPool: MemPool
  private readonly node: IronfishNode
  private readonly metrics: MetricsMonitor

  blocksMined = 0
  minersConnected = 0

  emptyMinersFeeCache: Map<number, Promise<Transaction>> = new Map()
  emptyBlockCache: Map<number, Block> = new Map()
  normalBlockCache: Map<number, Block> = new Map()

  readonly onNewBlock = new Event<[Block]>()

  constructor(options: {
    chain: Blockchain
    node: IronfishNode
    memPool: MemPool
    metrics: MetricsMonitor
  }) {
    this.node = options.node
    this.memPool = options.memPool
    this.chain = options.chain
    this.metrics = options.metrics
  }

  /**
   * Construct the set of transactions to include in the new block and
   * the sum of the associated fees.
   *
   * @param sequence The sequence of the next block to be included in the chain
   * @returns
   */
  async getNewBlockTransactions(
    sequence: number,
    currBlockSize: number,
  ): Promise<{
    totalFees: bigint
    blockTransactions: Transaction[]
    newBlockSize: number
  }> {
    const startTime = BenchUtils.start()

    // Fetch pending transactions
    const blockTransactions: Transaction[] = []
    const nullifiers = new BufferSet()
    for (const transaction of this.memPool.orderedTransactions()) {
      // Skip transactions that would cause the block to exceed the max size
      const transactionSize = getTransactionSize(transaction)
      if (currBlockSize + transactionSize > this.chain.consensus.parameters.maxBlockSizeBytes) {
        continue
      }

      if (isExpiredSequence(transaction.expiration(), sequence)) {
        continue
      }

      const isConflicted = transaction.spends.find((spend) => nullifiers.has(spend.nullifier))
      if (isConflicted) {
        continue
      }

      const { valid: isValid } = await this.chain.verifier.verifyTransactionSpends(transaction)
      if (!isValid) {
        continue
      }

      for (const spend of transaction.spends) {
        nullifiers.add(spend.nullifier)
      }

      currBlockSize += transactionSize
      blockTransactions.push(transaction)
    }

    // Sum the transaction fees
    let totalTransactionFees = BigInt(0)
    const transactionFees = await Promise.all(blockTransactions.map((t) => t.fee()))
    for (const transactionFee of transactionFees) {
      totalTransactionFees += transactionFee
    }

    this.metrics.mining_newBlockTransactions.add(BenchUtils.end(startTime))

    return {
      totalFees: totalTransactionFees,
      blockTransactions,
      newBlockSize: currBlockSize,
    }
  }

  async getEmptyMinersFee(sequence: number, spendingKey: string): Promise<Transaction> {
    this.node.logger.debug(`[krx] Starting getEmptyMinersFee ${sequence}`)
    let minersFee: Transaction
    const minersFeePromise = this.emptyMinersFeeCache.get(sequence)
    if (minersFeePromise !== undefined) {
      this.node.logger.debug(`[krx] Found cached EMPTY miners fee ${sequence}`)
      minersFee = await minersFeePromise
    } else {
      this.node.logger.debug(`[krx] Can't find cached EMPTY miners fee. Creating. ${sequence}`)
      minersFee = await this.node.strategy.createMinersFee(
        BigInt(0),
        sequence,
        spendingKey
      )
    }

    const nextSequence = sequence + 1
    if (this.emptyMinersFeeCache.get(nextSequence) === undefined) {
      this.node.logger.debug(`[krx] Firing background EMPTY miners fee routine for ${nextSequence}`)
      this.emptyMinersFeeCache.set(
        nextSequence,
        this.node.strategy.createMinersFee(
          BigInt(0),
          nextSequence,
          spendingKey
        )
      )
    }

    const prevSequence = sequence - 1
    this.emptyMinersFeeCache.delete(prevSequence)

    return minersFee
  }

  async createEmptyBlockTemplate(currentBlock: Block): Promise<SerializedBlockTemplate> {
    const newBlockSequence = currentBlock.header.sequence + 1
    const cachedBlock = this.emptyBlockCache.get(newBlockSequence)
    if (cachedBlock !== undefined) {
      this.node.logger.debug(`Hit empty block cache! ${newBlockSequence}`)
      return BlockTemplateSerde.serialize(cachedBlock, currentBlock)
    }

    const account = this.node.wallet.getDefaultAccount()
    Assert.isNotNull(account, 'Cannot mine without an account')
    Assert.isNotNull(account.spendingKey, 'Account must have spending key in order to mine')


    this.node.logger.debug(
      `[krx] Begin constructing new EMPTY block template for block sequence ${newBlockSequence}`,
    )
    const minersFee = await this.getEmptyMinersFee(newBlockSequence, account.spendingKey)

    const blockTransactions: Transaction[] = []
    const newBlock = await this.chain.newBlock(
      blockTransactions,
      minersFee,
      GraffitiUtils.fromString(this.node.config.get('blockGraffiti')),
    )
    this.node.logger.debug(
      `[krx] Created EMPTY block template ${newBlock.header.sequence}, with ${newBlock.transactions.length} transactions`,
    )

    this.emptyBlockCache.set(newBlockSequence, newBlock)
    return BlockTemplateSerde.serialize(newBlock, currentBlock)
  }

  /**
   * Construct the new block template which is everything a miner needs to begin mining.
   *
   * @param currentBlock The head block of the current heaviest chain
   * @returns
   */
  async createNewBlockTemplate(currentBlock: Block): Promise<SerializedBlockTemplate> {
    const newBlockSequence = currentBlock.header.sequence + 1
    const cachedBlock = this.normalBlockCache.get(newBlockSequence)
    if (cachedBlock !== undefined) {
      this.node.logger.debug(`Hit normal block cache! ${newBlockSequence}`)
      return BlockTemplateSerde.serialize(cachedBlock, currentBlock)
    }

    const startTime = BenchUtils.start()

    const account = this.node.wallet.getDefaultAccount()
    Assert.isNotNull(account, 'Cannot mine without an account')
    Assert.isNotNull(account.spendingKey, 'Account must have spending key in order to mine')

    this.node.logger.debug(
      `[krx] Begin constructing new block template for block sequence ${newBlockSequence}`,
    )

    this.node.logger.debug(`[krx] Getting new block transactions ${newBlockSequence}`)
    const currBlockSize = getBlockWithMinersFeeSize()
    const { totalFees, blockTransactions, newBlockSize } = await this.getNewBlockTransactions(
      newBlockSequence,
      currBlockSize,
    )

    // Calculate the final fee for the miner of this block
    const minersFee = await this.node.strategy.createMinersFee(
      totalFees,
      newBlockSequence,
      account.spendingKey,
    )
    this.node.logger.debug(
      `[krx] Constructed miner's reward transaction for account ${account.displayName}, block sequence ${newBlockSequence}`,
    )

    const txSize = getTransactionSize(minersFee)
    Assert.isEqual(
      MINERS_FEE_TRANSACTION_SIZE_BYTES,
      txSize,
      "Incorrect miner's fee transaction size used during block creation",
    )

    // Create the new block as a template for mining
    const newBlock = await this.chain.newBlock(
      blockTransactions,
      minersFee,
      GraffitiUtils.fromString(this.node.config.get('blockGraffiti')),
    )
    Assert.isEqual(
      newBlockSize,
      getBlockSize(newBlock),
      'Incorrect block size calculated during block creation',
    )

    this.node.logger.debug(
      `[krx] Created block template ${newBlock.header.sequence}, with ${newBlock.transactions.length} transactions`,
    )

    this.metrics.mining_newBlockTemplate.add(BenchUtils.end(startTime))

    this.normalBlockCache.set(newBlockSequence, newBlock)
    return BlockTemplateSerde.serialize(newBlock, currentBlock)
  }

  async submitBlockTemplate(blockTemplate: SerializedBlockTemplate): Promise<MINED_RESULT> {
    const block = BlockTemplateSerde.deserialize(blockTemplate)

    const blockDisplay = `${block.header.hash.toString('hex')} (${block.header.sequence})`
    this.node.logger.debug(`[krx] Received mined block (New block seen) ${blockDisplay}`)
    if (!block.header.previousBlockHash.equals(this.node.chain.head.hash)) {
      const previous = await this.node.chain.getPrevious(block.header)

      const work = block.header.target.toDifficulty()
      block.header.work = (previous ? previous.work : BigInt(0)) + work

      if (!isBlockHeavier(block.header, this.node.chain.head)) {
        this.node.logger.info(
          `Discarding mined block ${blockDisplay} that no longer attaches to heaviest head`,
        )

        return MINED_RESULT.CHAIN_CHANGED
      }
    }

    this.node.logger.debug(`[krx] Verifying mined block ${blockDisplay}`)
    const validation = await this.node.chain.verifier.verifyBlock(block)

    if (!validation.valid) {
      this.node.logger.info(
        `Discarding invalid mined block ${blockDisplay} ${validation.reason || 'undefined'}`,
      )
      return MINED_RESULT.INVALID_BLOCK
    }

    this.node.logger.debug(`[krx] Trying to add mined block to chain ${blockDisplay}`)
    const { isAdded, reason, isFork } = await this.node.chain.addBlock(block)

    if (!isAdded) {
      this.node.logger.info(
        `Failed to add mined block ${blockDisplay} to chain with reason ${String(reason)}`,
      )
      return MINED_RESULT.ADD_FAILED
    }

    if (isFork) {
      this.node.logger.info(
        `Failed to add mined block ${blockDisplay} to main chain. Block was added as a fork`,
      )
      return MINED_RESULT.FORK
    }

    this.node.logger.info(
      `[krx] Successfully mined block ${blockDisplay} with ${block.transactions.length} transactions`,
    )

    this.blocksMined++
    this.onNewBlock.emit(block)

    return MINED_RESULT.SUCCESS
  }
}
