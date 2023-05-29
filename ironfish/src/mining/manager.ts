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

  private prune(cache: Map<number, any>, sequence: number) {
    for (let key of cache.keys()) {
      if (key < sequence) {
        cache.delete(key)
      }
    }
  }

  getEmptyBlock(sequence: number): Block | undefined  {
    return this.emptyBlock.get(sequence)
  }

  setEmptyBlock(block: Block) {
    this.node.logger.debug(`[krx] [${block.header.sequence}] Setting empty block in cache ${block.header.sequence}`)
    this.prune(this.emptyBlock, block.header.sequence)
    this.emptyBlock.set(block.header.sequence, block)
  }

  getFullBlock(sequence: number): Block | undefined {
    return this.fullBlock.get(sequence)
  }

  setFullBlock(block: Block) {
    this.node.logger.debug(`[krx] [${block.header.sequence}] Setting full block in cache`)
    this.prune(this.fullBlock, block.header.sequence)
    this.fullBlock.set(block.header.sequence, block)
  }

  getEmptyMinersFee(sequence: number): Promise<Transaction> | undefined {
    return this.emptyMinersFee.get(sequence)
  }

  async pregenEmptyMinersFee(sequence: number, spendingKey: string): Promise<void> {
    this.node.logger.debug(`[krx] [${sequence}] Pregenerating empty miners fee`)
    this.prune(this.emptyMinersFee, sequence)
    if (this.emptyMinersFee.has(sequence)) {
      this.node.logger.debug(`[krx] [${sequence}] Already has empty fee promise for the sequence`)
      return
    }
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

  async createEmptyMinersFee(sequence: number, spendingKey: string): Promise<Transaction> {

    this.node.logger.debug(`[krx] [${sequence}] Creating empty miners fee`)
    const emptyMinersFee = await this.node.strategy.createMinersFee(
      BigInt(0),
      sequence,
      spendingKey
    )
    void this.cache.pregenEmptyMinersFee(sequence + 1, spendingKey)
    return emptyMinersFee
  }

  async createEmptyBlock(sequence: number, spendingKey: string): Promise<Block> {
    this.node.logger.debug(`[krx] [${sequence}] Started createEmptyBlock`)

    let minersFee: Transaction
    const cachedEmptyMinersFeePromise = this.cache.getEmptyMinersFee(sequence)
    if (cachedEmptyMinersFeePromise) {
      this.node.logger.debug(`[krx] [${sequence}] Found cached emptyMinersFee promise, awaiting`)
      minersFee = await cachedEmptyMinersFeePromise
    } else {
      this.node.logger.debug(`[krx] [${sequence}] No cached emptyMinersFee promise, creating`)
      minersFee = await this.createEmptyMinersFee(sequence, spendingKey)
    }
    const txSize = getTransactionSize(minersFee)
    Assert.isEqual(
      MINERS_FEE_TRANSACTION_SIZE_BYTES,
      txSize,
      "Incorrect miner's fee transaction size used during block creation",
    )

    this.node.logger.debug(`[krx] [${sequence}] Constructing empty block`)
    const blockTransactions: Transaction[] = []
    const emptyBlock = await this.chain.newBlock(
      blockTransactions,
      minersFee,
      GraffitiUtils.fromString(this.node.config.get('blockGraffiti')),
    )
    Assert.isEqual(
      getBlockWithMinersFeeSize(),
      getBlockSize(emptyBlock),
      'Incorrect block size calculated during block creation',
    )

    this.cache.setEmptyBlock(emptyBlock)
    this.node.logger.debug(`[krx] [${sequence}] Finished createEmptyBlock`)
    return emptyBlock
  }

  async createFullBlock(sequence: number, spendingKey: string): Promise<Block> {
    this.node.logger.debug(`[krx] [${sequence}] Started createFullBlock`)
    const currBlockSize = getBlockWithMinersFeeSize()
    const { totalFees, blockTransactions, newBlockSize } = await this.getNewBlockTransactions(
      sequence,
      currBlockSize,
    )

    this.node.logger.debug(`[krx] [${sequence}] Creating full miners fee`)
    const minersFee = await this.node.strategy.createMinersFee(
      totalFees,
      sequence,
      spendingKey,
    )
    const txSize = getTransactionSize(minersFee)
    Assert.isEqual(
      MINERS_FEE_TRANSACTION_SIZE_BYTES,
      txSize,
      "Incorrect miner's fee transaction size used during block creation",
    )

    this.node.logger.debug(`[krx] [${sequence}] Constructing full block`)
    const fullBlock = await this.chain.newBlock(
      blockTransactions,
      minersFee,
      GraffitiUtils.fromString(this.node.config.get('blockGraffiti')),
    )
    Assert.isEqual(
      newBlockSize,
      getBlockSize(fullBlock),
      'Incorrect block size calculated during block creation',
    )

    this.cache.setFullBlock(fullBlock)
    this.node.logger.debug(`[krx] [${sequence}] Finished createFullBlock`)
    return fullBlock
  }

  /**
   * Construct the new empty block template to begin mining immediately.
   * This is an optimization made to decrease the latency between seeing
   * a new block and starting mining a new height.
   *
   * Empty block can be constructed using pre-generated minersFee,
   * thus reducing the template generation time from 500-1000ms down to 10-50ms.
   *
   * @param currentBlock The head block of the current heaviest chain
   * @param spendingKey Miner's account spending key
   * @returns
   */
  async createEmptyBlockTemplate(currentBlock: Block, spendingKey: string): Promise<SerializedBlockTemplate> {
    const newBlockSequence = currentBlock.header.sequence + 1
    this.node.logger.debug(`[krx] [${newBlockSequence}] Started createEmptyBlockTemplate`)

    this.node.logger.debug(`[krx] [${newBlockSequence}] Trying to get empty block from cache`)
    const cachedBlock = this.cache.getEmptyBlock(newBlockSequence)
    if (cachedBlock) {
      this.node.logger.debug(`[krx] [${newBlockSequence}] Found empty block in cache`)
      return BlockTemplateSerde.serialize(cachedBlock, currentBlock)
    }

    this.node.logger.debug(`[krx] [${newBlockSequence}] No empty block in cache, creating new one`)
    const emptyBlock = await this.createEmptyBlock(newBlockSequence, spendingKey)
    this.node.logger.debug(`[krx] [${newBlockSequence}] Finished creating empty block`)
    return BlockTemplateSerde.serialize(emptyBlock, currentBlock)
  }

  /**
   * Construct the new full block template with transactions from mem pool.
   *
   * @param currentBlock The head block of the current heaviest chain
   * @param spendingKey Miner's account spending key
   * @returns
   */
  async createFullBlockTemplate(currentBlock: Block, spendingKey: string): Promise<SerializedBlockTemplate> {
    const newBlockSequence = currentBlock.header.sequence + 1
    this.node.logger.debug(
      `[krx] [${newBlockSequence}] Started createFullBlockTemplate`,
    )

    this.node.logger.debug(`[krx] [${newBlockSequence}] Trying to get full block from cache`)
    const cachedBlock = this.cache.getFullBlock(newBlockSequence)
    if (cachedBlock) {
      this.node.logger.debug(`[krx] [${newBlockSequence}] Found full block in cache`)
      return BlockTemplateSerde.serialize(cachedBlock, currentBlock)
    }

    this.node.logger.debug(`[krx] [${newBlockSequence}] No full block in cache, is mempool empty?`)
    if (this.memPool.count() === 0) {
      this.node.logger.debug(`[krx] [${newBlockSequence}] Mempool is empty, calling createEmptyBlockTemplate`)
      return await this.createEmptyBlockTemplate(currentBlock, spendingKey)
    }

    this.node.logger.debug(`[krx] [${newBlockSequence}] Mempool is not empty. Generating full block.`)
    const fullBlock = await this.createFullBlock(newBlockSequence, spendingKey)
    this.node.logger.debug(`[krx] [${newBlockSequence}] Finished creating full block ${newBlockSequence}`)
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
