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
import { ErrorUtils } from '../utils'
import { BenchUtils } from '../utils/bench'
import { GraffitiUtils } from '../utils/graffiti'
import { SpendingAccount } from '../wallet'
import { MinersFeeCache } from './minersFeeCache'

export enum MINED_RESULT {
  UNKNOWN_REQUEST = 'UNKNOWN_REQUEST',
  CHAIN_CHANGED = 'CHAIN_CHANGED',
  ADD_FAILED = 'ADD_FAILED',
  FORK = 'FORK',
  SUCCESS = 'SUCCESS',
}

export class MiningManager {
  private readonly chain: Blockchain
  private readonly memPool: MemPool
  private readonly node: IronfishNode
  private readonly metrics: MetricsMonitor
  private readonly minersFeeCache: MinersFeeCache

  blocksMined = 0

  // Called when a new block has been mined and added to the chain
  readonly onNewBlock = new Event<[Block]>()

  private templateStream?: {
    onNewBlockTemplate: Event<[SerializedBlockTemplate]>
    mostRecent?: {
      template: SerializedBlockTemplate
      priority: number
      prevBlock: Block
    }
  }

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
    this.minersFeeCache = new MinersFeeCache({ node: this.node })

    this.chain.onConnectBlock.on((block) => this.onConnectedBlock(block))
  }

  get minersConnected(): number {
    return this.templateStream?.onNewBlockTemplate.subscribers || 0
  }

  onNewBlockTemplate(listener: (template: SerializedBlockTemplate) => void): void {
    if (!this.templateStream) {
      const onNewBlockTemplate = new Event<[SerializedBlockTemplate]>()
      onNewBlockTemplate.on(listener)
      this.templateStream = { onNewBlockTemplate }

      // Send an initial block template to the requester so they can begin working immediately
      void this.chain.getBlock(this.chain.head).then((currentBlock) => {
        if (currentBlock) {
          this.onConnectedBlock(currentBlock)
        }
      })

      return
    }

    if (this.templateStream.mostRecent) {
      listener(this.templateStream.mostRecent.template)
    }

    this.templateStream.onNewBlockTemplate.on(listener)
  }

  offNewBlockTemplate(listener: (template: SerializedBlockTemplate) => void): void {
    if (this.templateStream) {
      this.templateStream.onNewBlockTemplate.off(listener)
      if (this.templateStream.onNewBlockTemplate.isEmpty) {
        this.templateStream = undefined
      }
    }
  }

  streamBlockTemplate(
    currentBlock: Block,
    template: SerializedBlockTemplate,
    priority: number,
  ): void {
    // If there are not listeners for new blocks, return early
    if (!this.templateStream) {
      return
    }

    // If the new template is not building on top of a heavier block, return early
    if (
      this.templateStream.mostRecent &&
      isBlockHeavier(this.templateStream.mostRecent.prevBlock.header, currentBlock.header)
    ) {
      return
    }

    // If new template was created after the current template, return early
    if (this.templateStream.mostRecent && priority < this.templateStream.mostRecent.priority) {
      return
    }

    this.templateStream.onNewBlockTemplate.emit(template)
    this.templateStream.mostRecent = {
      template,
      priority,
      prevBlock: currentBlock,
    }
  }

  private onConnectedBlock(currentBlock: Block): void {
    const connectedAt = BenchUtils.start()

    // If there are not listeners for new blocks, then return early
    if (!this.templateStream) {
      return
    }

    // If we mine when we're not synced, then we will mine a fork no one cares about
    if (!this.node.chain.synced && !this.node.config.get('miningForce')) {
      return
    }

    // If we mine when we're not connected to anyone, then no one will get our blocks
    if (!this.node.peerNetwork.isReady && !this.node.config.get('miningForce')) {
      return
    }

    const account = this.node.wallet.getDefaultAccount()
    if (!account) {
      this.node.logger.info('Cannot mine without an account')
      return
    }

    if (!account.isSpendingAccount()) {
      this.node.logger.info('Account must have spending key in order to mine')
      return
    }

    // Kick off job to creating the next empty miners fee
    this.minersFeeCache.startCreatingEmptyMinersFee(currentBlock.header.sequence + 2, account)

    void this.createNewEmptyBlockTemplate(currentBlock, account)
      .then((template: SerializedBlockTemplate) => {
        this.metrics.mining_newEmptyBlockTemplate.add(BenchUtils.end(connectedAt))
        this.streamBlockTemplate(currentBlock, template, 0)
      })
      .catch((error) => {
        this.node.logger.info(`Discarding block template: ${ErrorUtils.renderError(error)}`)
      })

    void this.createNewBlockTemplate(currentBlock, account)
      .then((template: SerializedBlockTemplate) => {
        this.metrics.mining_newBlockTemplate.add(BenchUtils.end(connectedAt))
        this.streamBlockTemplate(currentBlock, template, 1)
      })
      .catch((error) => {
        this.node.logger.info(`Discarding block template: ${ErrorUtils.renderError(error)}`)
      })
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

  /**
   * Construct the new block template which is everything a miner needs to begin mining.
   *
   * @param currentBlock The head block of the current heaviest chain
   * @returns
   */
  async createNewBlockTemplate(
    currentBlock: Block,
    account: SpendingAccount,
  ): Promise<SerializedBlockTemplate> {
    const newBlockSequence = currentBlock.header.sequence + 1

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
      `Constructed miner's reward transaction for account ${account.displayName}, block sequence ${newBlockSequence}`,
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
      currentBlock.header,
    )

    Assert.isEqual(
      newBlockSize,
      getBlockSize(newBlock),
      'Incorrect block size calculated during block creation',
    )

    this.node.logger.debug(
      `Current block template ${newBlock.header.sequence}, has ${newBlock.transactions.length} transactions`,
    )

    return BlockTemplateSerde.serialize(newBlock, currentBlock)
  }

  /**
   * Construct the new block template with 0 transactions. This is faster to construct
   * than the full block, and is used to start mining while the full block is being constructed.
   *
   * @param currentBlock The block to create the new block on top of
   * @returns
   */
  async createNewEmptyBlockTemplate(
    currentBlock: Block,
    account: SpendingAccount,
  ): Promise<SerializedBlockTemplate> {
    const newBlockSequence = currentBlock.header.sequence + 1

    const currBlockSize = getBlockWithMinersFeeSize()

    const minersFee = await this.minersFeeCache.createEmptyMinersFee(newBlockSequence, account)

    this.node.logger.debug(
      `Constructed miner's reward transaction for account ${account.displayName}, block sequence ${newBlockSequence}`,
    )

    const txSize = getTransactionSize(minersFee)
    Assert.isEqual(
      MINERS_FEE_TRANSACTION_SIZE_BYTES,
      txSize,
      "Incorrect miner's fee transaction size used during block creation",
    )

    // Create the new block as a template for mining
    const newBlock = await this.chain.newBlock(
      [],
      minersFee,
      GraffitiUtils.fromString(this.node.config.get('blockGraffiti')),
      currentBlock.header,
    )

    Assert.isEqual(
      currBlockSize,
      getBlockSize(newBlock),
      'Incorrect block size calculated during block creation',
    )

    this.node.logger.debug(
      `Current block template ${newBlock.header.sequence}, has ${newBlock.transactions.length} transactions`,
    )

    return BlockTemplateSerde.serialize(newBlock, currentBlock)
  }

  async submitBlockTemplate(blockTemplate: SerializedBlockTemplate): Promise<MINED_RESULT> {
    const block = BlockTemplateSerde.deserialize(blockTemplate)

    const blockDisplay = `${block.header.hash.toString('hex')} (${block.header.sequence})`
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
      `Successfully mined block ${blockDisplay} with ${block.transactions.length} transactions`,
    )

    this.blocksMined++
    this.onNewBlock.emit(block)

    return MINED_RESULT.SUCCESS
  }
}
