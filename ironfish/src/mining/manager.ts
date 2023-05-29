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

class MiningManagerCache {
  private readonly emptyMinersFee: Map<number, Promise<Transaction>>
  private readonly emptyBlock: Map<number, Block>
  private readonly fullBlock: Map<number, Block>
  private readonly node: IronfishNode

  constructor(node: IronfishNode) {
    this.emptyMinersFee = new Map()
    this.emptyBlock = new Map()
    this.fullBlock = new Map()
    this.node = node
  }

  deleteOutdated(sequence: number) {
    const prune = (map: Map<number, any>, n: number) => {
      for (let key of map.keys()) {
        if (key < n) {
          map.delete(key)
        }
      }
    }
    sequence--
    prune(this.emptyMinersFee, sequence)
    prune(this.emptyBlock, sequence)
    prune(this.fullBlock, sequence)
  }

  // getEmptyBlock(sequence: number, spendingKey: string) { TODO
  getEmptyBlock(sequence: number): Block | undefined  {
    this.deleteOutdated(sequence)
    if (this.emptyBlock.has(sequence)) {
      return this.emptyBlock.get(sequence)
    }
  }

  setEmptyBlock(block: Block) {
    this.node.logger.debug(`Setting empty block in cache ${block.header.sequence}`)
    this.emptyBlock.set(block.header.sequence, block)
  }

  getFullBlock(sequence: number): Block | undefined {
    this.deleteOutdated(sequence)
    if (this.fullBlock.has(sequence)) {
      return this.fullBlock.get(sequence)
    }
  }

  setFullBlock(block: Block) {
    this.node.logger.debug(`Setting full block in cache ${block.header.sequence}`)
    this.fullBlock.set(block.header.sequence, block)
  }

  async pregenEmptyMinersFee(sequence: number, spendingKey: string): Promise<void> {
    if (this.emptyMinersFee.get(sequence) === undefined) {
      this.node.logger.debug(`[krx] Firing background EMPTY miners fee routine for ${sequence}`)
      this.emptyMinersFee.set(
        sequence,
        this.node.strategy.createMinersFee(
          BigInt(0),
          sequence,
          spendingKey
        )
      )
    }
  }

  async getEmptyMinersFee(sequence: number, spendingKey: string): Promise<Transaction> {
    this.node.logger.debug(`[krx] Starting getEmptyMinersFee ${sequence}`)
    let minersFee: Transaction
    const minersFeePromise = this.emptyMinersFee.get(sequence)
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
    void this.pregenEmptyMinersFee(sequence + 1, spendingKey)
    this.deleteOutdated(sequence)
    return minersFee
  }
}

export class MiningManager {
  private readonly chain: Blockchain
  private readonly memPool: MemPool
  private readonly node: IronfishNode
  private readonly metrics: MetricsMonitor
  private readonly cache: MiningManagerCache

  blocksMined = 0
  minersConnected = 0

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
    this.cache = new MiningManagerCache(options.node)
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

  async createEmptyBlock(sequence: number, spendingKey: string): Promise<Block> {
    this.node.logger.debug(`[krx] Started createEmptyBlock ${sequence}`)
    const minersFee = await this.cache.getEmptyMinersFee(sequence, spendingKey)

    const blockTransactions: Transaction[] = []
    const emptyBlock = await this.chain.newBlock(
      blockTransactions,
      minersFee,
      GraffitiUtils.fromString(this.node.config.get('blockGraffiti')),
    )
    this.cache.setEmptyBlock(emptyBlock)
    this.node.logger.debug(`[krx] Finished createEmptyBlock ${sequence}`)
    return emptyBlock
  }

  async createFullBlock(sequence: number, spendingKey: string): Promise<Block> {
    this.node.logger.debug(`[krx] Started createFullBlock ${sequence}`)
    const currBlockSize = getBlockWithMinersFeeSize()
    const { totalFees, blockTransactions, newBlockSize } = await this.getNewBlockTransactions(
      sequence,
      currBlockSize,
    )
    const minersFee = await this.node.strategy.createMinersFee(
      totalFees,
      sequence,
      spendingKey,
    )
    const fullBlock = await this.chain.newBlock(
      blockTransactions,
      minersFee,
      GraffitiUtils.fromString(this.node.config.get('blockGraffiti')),
    )
    this.cache.setFullBlock(fullBlock)
    this.node.logger.debug(`[krx] Finished createFullBlock ${sequence}`)
    return fullBlock
  }

  async createEmptyBlockTemplate(currentBlock: Block, spendingKey: string): Promise<SerializedBlockTemplate> {
    const newBlockSequence = currentBlock.header.sequence + 1
    this.node.logger.debug(`[krx] Started createEmptyBlockTemplate ${newBlockSequence}`)

    this.node.logger.debug(`Trying get empty block from cache ${newBlockSequence}`)
    const cachedBlock = this.cache.getEmptyBlock(newBlockSequence)
    if (cachedBlock !== undefined) {
      this.node.logger.debug(`Hit empty block cache! ${newBlockSequence}`)
      return BlockTemplateSerde.serialize(cachedBlock, currentBlock)
    }

    this.node.logger.debug(`Creating empty block ${newBlockSequence}`)
    const emptyBlock = await this.createEmptyBlock(newBlockSequence, spendingKey)
    this.node.logger.debug(`Finished creating empty block ${newBlockSequence}`)
    return BlockTemplateSerde.serialize(emptyBlock, currentBlock)
  }

  async createFullBlockTemplate(currentBlock: Block, spendingKey: string): Promise<SerializedBlockTemplate> {
    const newBlockSequence = currentBlock.header.sequence + 1
    this.node.logger.debug(
      `[krx] Started createFullBlockTemplate ${newBlockSequence}`,
    )

    this.node.logger.debug(`Trying get full block from cache ${newBlockSequence}`)
    const cachedBlock = this.cache.getFullBlock(newBlockSequence)
    if (cachedBlock !== undefined) {
      this.node.logger.debug(`Hit full block cache! ${newBlockSequence}`)
      return BlockTemplateSerde.serialize(cachedBlock, currentBlock)
    }

    if (this.memPool.count() === 0) {
      this.node.logger.debug(`Mempool empty. Calling createEmptyBlockTemplate ${newBlockSequence}`)
      return await this.createEmptyBlockTemplate(currentBlock, spendingKey)
    }

    this.node.logger.debug(`Creating full block ${newBlockSequence}`)
    const fullBlock = await this.createFullBlock(newBlockSequence, spendingKey)
    this.node.logger.debug(`Finished creating full block ${newBlockSequence}`)
    return BlockTemplateSerde.serialize(fullBlock, currentBlock)
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
