/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import AsyncTransaction from './asyncTransaction'

/**
 * AsyncTransaction Workers have a time-to-start of a few seconds because of
 * Sapling setup time. We can keep a started one running to mitigate this time.
 */
class AsyncTransactionWorkerPoolClass {
  /**
   * A transaction waiting to be returned by createTransaction.
   */
  private waitingTransaction: AsyncTransaction | undefined

  /**
   * Primes the pool by creating an AsyncTransaction.
   */
  start(): AsyncTransactionWorkerPoolClass {
    this.waitingTransaction = new AsyncTransaction()
    return this
  }

  /**
   * Shuts down the worker in waitingTransaction and deletes the transaction.
   */
  async stop(): Promise<undefined> {
    const trans = this.waitingTransaction
    this.waitingTransaction = undefined
    await trans?.cancel()
    return
  }

  /**
   * Returns waitingTransaction and replaces it with a fresh AsyncTransaction.
   */
  createTransaction(): AsyncTransaction {
    if (!this.waitingTransaction) {
      return this.start().createTransaction()
    }
    const trans = this.waitingTransaction
    this.waitingTransaction = new AsyncTransaction()
    return trans
  }
}

/**
 * Export the pool as a singleton.
 */
export const AsyncTransactionWorkerPool = new AsyncTransactionWorkerPoolClass()
