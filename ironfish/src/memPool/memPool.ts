/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { createRootLogger, Logger } from '../logger'
import { Transaction } from '../primitives/transaction'
import { Strategy } from '../strategy'

export class MemPool {
  transactions = new BufferMap<Transaction>()
  chain: Blockchain
  strategy: Strategy
  logger: Logger

  constructor(options: { strategy: Strategy; chain: Blockchain; logger?: Logger }) {
    const logger = options.logger || createRootLogger()

    this.chain = options.chain
    this.strategy = options.strategy
    this.logger = logger.withTag('mempool')
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
}
