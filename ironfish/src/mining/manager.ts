/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferSet } from 'buffer-map'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { Event } from '../event'
import { MemPool } from '../memPool'
import { IronfishNode } from '../node'
import { Block } from '../primitives/block'
import { Transaction } from '../primitives/transaction'
import { BlockTemplateSerde, SerializedBlockTemplate } from '../serde'
import { AsyncUtils } from '../utils/async'
import { GraffitiUtils } from '../utils/graffiti'

const MAX_TRANSACTIONS_PER_BLOCK = 300

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

  blocksMined = 0
  minersConnected = 0

  readonly onNewBlock = new Event<[Block]>()

  constructor(options: { chain: Blockchain; node: IronfishNode; memPool: MemPool }) {
    this.node = options.node
    this.memPool = options.memPool
    this.chain = options.chain
  }

  /**
   * Construct the set of transactions to include in the new block and
   * the sum of the associated fees.
   *
   * @param sequence The sequence of the next block to be included in the chain
   * @returns
   */
  async getNewBlockTransactions(sequence: number): Promise<{
    totalFees: bigint
    blockTransactions: Transaction[]
  }> {
    // Fetch pending transactions
    const blockTransactions: Transaction[] = []
    const nullifiers = new BufferSet()
    for (const transaction of this.memPool.orderedTransactions()) {
      if (blockTransactions.length >= MAX_TRANSACTIONS_PER_BLOCK) {
        break
      }

      const isExpired = this.chain.verifier.isExpiredSequence(
        transaction.expirationSequence(),
        sequence,
      )
      if (isExpired) {
        continue
      }

      const isConflicted = await AsyncUtils.find(transaction.spends(), (spend) => {
        return nullifiers.has(spend.nullifier)
      })
      if (isConflicted) {
        continue
      }

      const { valid: isValid } = await this.chain.verifier.verifyTransactionSpends(transaction)
      if (!isValid) {
        continue
      }

      for (const spend of transaction.spends()) {
        nullifiers.add(spend.nullifier)
      }

      blockTransactions.push(transaction)
    }

    // Sum the transaction fees
    let totalTransactionFees = BigInt(0)
    const transactionFees = await Promise.all(blockTransactions.map((t) => t.fee()))
    for (const transactionFee of transactionFees) {
      totalTransactionFees += transactionFee
    }

    return {
      totalFees: totalTransactionFees,
      blockTransactions,
    }
  }

  /**
   * Construct the new block template which is everything a miner needs to begin mining.
   *
   * @param currentBlock The head block of the current heaviest chain
   * @returns
   */
  async createNewBlockTemplate(currentBlock: Block): Promise<SerializedBlockTemplate> {
    const newBlockSequence = currentBlock.header.sequence + 1

    const { totalFees, blockTransactions } = await this.getNewBlockTransactions(
      newBlockSequence,
    )

    const account = this.node.accounts.getDefaultAccount()
    Assert.isNotNull(account, 'Cannot mine without an account')

    // Calculate the final fee for the miner of this block
    const minersFee = await this.node.strategy.createMinersFee(
      totalFees,
      newBlockSequence,
      account.spendingKey,
    )
    this.node.logger.debug(
      `Constructed miner's reward transaction for account ${account.displayName}, block sequence ${newBlockSequence}`,
    )

    // Create the new block as a template for mining
    const newBlock = await this.chain.newBlock(
      blockTransactions,
      minersFee,
      GraffitiUtils.fromString(this.node.config.get('blockGraffiti')),
    )

    this.node.logger.debug(
      `Current block template ${newBlock.header.sequence}, has ${newBlock.transactions.length} transactions`,
    )

    return BlockTemplateSerde.serialize(newBlock, currentBlock)
  }

  async submitBlockTemplate(blockTemplate: SerializedBlockTemplate): Promise<MINED_RESULT> {
    const block = BlockTemplateSerde.deserialize(this.node.strategy, blockTemplate)

    const blockDisplay = `${block.header.hash.toString('hex')} (${block.header.sequence})`
    if (
      !this.node.chain.head ||
      !block.header.previousBlockHash.equals(this.node.chain.head.hash)
    ) {
      this.node.logger.info(
        `Discarding mined block ${blockDisplay} that no longer attaches to heaviest head`,
      )

      return MINED_RESULT.CHAIN_CHANGED
    }

    const validation = await this.node.chain.verifier.verifyBlock(block)

    if (!validation.valid) {
      this.node.logger.info(
        `Discarding invalid mined block ${blockDisplay} ${validation.reason || 'undefined'}`,
      )
      return MINED_RESULT.INVALID_BLOCK
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
