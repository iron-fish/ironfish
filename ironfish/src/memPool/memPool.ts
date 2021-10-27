/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { createRootLogger, Logger } from '../logger'
import { Block, BlockHeader } from '../primitives'
import { Transaction } from '../primitives/transaction'
import { Strategy } from '../strategy'

export class MemPool {
  transactions = new BufferMap<Transaction>()
  chain: Blockchain
  head: BlockHeader | null
  strategy: Strategy
  logger: Logger

  constructor(options: { strategy: Strategy; chain: Blockchain; logger?: Logger }) {
    const logger = options.logger || createRootLogger()

    this.chain = options.chain
    this.head = null
    this.strategy = options.strategy
    this.logger = logger.withTag('mempool')

    this.chain.onConnectBlock.on((block) => {
      this.onConnectBlock(block)
    })

    this.chain.onDisconnectBlock.on(async (block) => {
      await this.onDisconnectBlock(block)
    })
  }

  size(): number {
    return this.transactions.size
  }

  exists(transactionHash: Buffer): boolean {
    return this.transactions.has(transactionHash)
  }

  *get(): Generator<Transaction, void, unknown> {
    for (const transaction of this.transactions.values()) {
      yield transaction
    }
  }

  /**
   * Accepts a transaction from the network
   */
  async acceptTransaction(transaction: Transaction): Promise<boolean> {
    const hash = transaction.transactionHash()

    if (this.transactions.has(hash)) {
      return false
    }

    const { valid, reason } = await this.chain.verifier.verifyTransaction(transaction)
    if (!valid) {
      Assert.isNotUndefined(reason)
      this.logger.debug(`Invalid transaction '${hash.toString('hex')}': ${reason}`)
      return false
    }

    this.transactions.set(hash, transaction)

    this.logger.debug(`Accepted tx ${hash.toString('hex')}, poolsize ${this.size()}`)
    return true
  }

  onConnectBlock(block: Block): void {
    let deletedTransactions = 0

    for (const transaction of block.transactions) {
      this.transactions.delete(transaction.transactionHash())
      deletedTransactions++
    }

    this.logger.debug(`Deleted ${deletedTransactions} transactions`)

    this.head = block.header
  }

  async onDisconnectBlock(block: Block): Promise<void> {
    let addedTransactions = 0

    for (const transaction of block.transactions) {
      const hash = transaction.transactionHash()

      if (!this.transactions.has(hash)) {
        this.transactions.set(hash, transaction)
        addedTransactions++
      }
    }

    this.logger.debug(`Added ${addedTransactions} transactions`)

    this.head = await this.chain.getHeader(block.header.previousBlockHash)
  }
}
