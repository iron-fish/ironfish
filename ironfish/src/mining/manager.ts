/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap, BufferSet } from 'buffer-map'
import { Assert } from '../assert'
import { Blockchain, HeadChangedError } from '../blockchain'
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
import { FullNode } from '../node'
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
  private readonly node: FullNode
  private readonly metrics: MetricsMonitor
  private readonly minersFeeCache: MinersFeeCache
  private readonly preemptiveBlockMining: boolean

  blocksMined = 0

  // Called when a new block has been mined and added to the chain
  readonly onNewBlock = new Event<[Block]>()

  private templateStream?: {
    onNewBlockTemplate: Event<[SerializedBlockTemplate]>
    mostRecent?: SerializedBlockTemplate
  }

  constructor(options: {
    chain: Blockchain
    node: FullNode
    memPool: MemPool
    metrics: MetricsMonitor
    preemptiveBlockMining?: boolean
  }) {
    this.node = options.node
    this.memPool = options.memPool
    this.chain = options.chain
    this.metrics = options.metrics
    this.minersFeeCache = new MinersFeeCache({ node: this.node })
    this.preemptiveBlockMining = options.preemptiveBlockMining ?? true

    this.chain.onConnectBlock.on(
      (block) =>
        void this.onConnectedBlock(block).catch((error) =>
          this.handleOnConnectBlockError(error, block),
        ),
    )
  }

  handleOnConnectBlockError(error: unknown, block: Block): void {
    if (error instanceof HeadChangedError) {
      this.node.logger.debug(
        `Chain head changed while creating block template for sequence ${
          block.header.sequence + 1
        }`,
      )
    } else {
      this.node.logger.error(`Error creating block template: ${ErrorUtils.renderError(error)}`)
    }
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
          void this.onConnectedBlock(currentBlock).catch((error) =>
            this.handleOnConnectBlockError(error, currentBlock),
          )
        }
      })

      return
    }

    if (this.templateStream.mostRecent) {
      listener(this.templateStream.mostRecent)
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

  streamBlockTemplate(currentBlock: Block, template: SerializedBlockTemplate): void {
    // If there are not listeners for new blocks, return early
    if (!this.templateStream) {
      return
    }

    // The head of the chain has changed, abort working on this template
    if (!this.chain.head.hash.equals(currentBlock.header.hash)) {
      return
    }

    this.templateStream.onNewBlockTemplate.emit(template)
    this.templateStream.mostRecent = template
  }

  private async onConnectedBlock(currentBlock: Block): Promise<void> {
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

    // The head of the chain has changed, abort working on this template
    if (!this.chain.head.hash.equals(currentBlock.header.hash)) {
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

    // If preemptive block mining is enabled, stream an empty block template as
    // soon as possible, so that miners do not spend idle time waiting for a
    // valid block to mine. Otherwise, stream an empty block only if there are
    // no pending transactions in the mempool.
    const emptyTemplate = await this.createNewBlockTemplate(currentBlock, account, false)
    this.metrics.mining_newEmptyBlockTemplate.add(BenchUtils.end(connectedAt))
    if (this.preemptiveBlockMining || !this.memPool.count()) {
      this.streamBlockTemplate(currentBlock, emptyTemplate)
    }

    // The head of the chain has changed, abort working on this template
    if (!this.chain.head.hash.equals(currentBlock.header.hash)) {
      return
    }

    // Kick off job to create the next empty miners fee
    this.minersFeeCache.startCreatingEmptyMinersFee(currentBlock.header.sequence + 2, account)

    // Only try creating a block with transactions if there are transactions in
    // the mempool
    if (this.memPool.count()) {
      const template = await this.createNewBlockTemplate(currentBlock, account)
      this.metrics.mining_newBlockTemplate.add(BenchUtils.end(connectedAt))
      this.streamBlockTemplate(currentBlock, template)

      const block = BlockTemplateSerde.deserialize(template, this.chain)
      const verification = await this.chain.verifier.verifyBlock(block, {
        verifyTarget: false,
      })

      if (!verification.valid) {
        // Abort working on invalid block template and re-send empty block
        this.streamBlockTemplate(currentBlock, emptyTemplate)

        throw new Error(verification.reason)
      }
    }
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
    const transactionVersion = this.chain.consensus.getActiveTransactionVersion(sequence)

    // Fetch pending transactions
    const blockTransactions: Transaction[] = []
    const nullifiers = new BufferSet()
    const assetOwners = new BufferMap<Buffer>()
    let totalTransactionFees = BigInt(0)
    for (const transaction of this.memPool.orderedTransactions()) {
      if (transaction.version() !== transactionVersion) {
        continue
      }

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

      if (transaction.mints.length) {
        const mintOwnerResult = await this.chain.verifier.verifyMintOwnersIncremental(
          transaction.mints,
          assetOwners,
        )

        // If the transaction is valid with the state of this new block
        // template, we need to update the assetOwners map with the latest state
        // of the owners, accounting for new mints and ownership transfer
        if (mintOwnerResult.valid) {
          for (const [assetId, assetOwner] of mintOwnerResult.assetOwners.entries()) {
            assetOwners.set(assetId, assetOwner)
          }
        } else {
          continue
        }
      }

      currBlockSize += transactionSize
      totalTransactionFees += transaction.fee()
      blockTransactions.push(transaction)
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
    includeTransactions = true,
  ): Promise<SerializedBlockTemplate> {
    const newBlockSequence = currentBlock.header.sequence + 1

    let currBlockSize = getBlockWithMinersFeeSize()
    let transactions: Transaction[] = []

    let minersFee: Transaction
    if (includeTransactions) {
      const { totalFees, blockTransactions, newBlockSize } = await this.getNewBlockTransactions(
        newBlockSequence,
        currBlockSize,
      )

      transactions = blockTransactions
      currBlockSize = newBlockSize

      // Calculate the final fee for the miner of this block
      minersFee = await this.node.chain.createMinersFee(
        totalFees,
        newBlockSequence,
        account.spendingKey,
      )
    } else {
      minersFee = await this.minersFeeCache.createEmptyMinersFee(newBlockSequence, account)
    }

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
      transactions,
      minersFee,
      GraffitiUtils.fromString(this.node.config.get('blockGraffiti')),
      currentBlock.header,
      false,
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
    const block = BlockTemplateSerde.deserialize(blockTemplate, this.chain)

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
