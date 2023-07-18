/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import LRU from 'blru'
import { Transaction } from '../primitives/transaction'
import { Strategy } from '../strategy'
import { SpendingAccount } from '../wallet'

export class MinersFeeCache {
  private readonly strategy: Strategy
  private readonly cache: LRU<string, Promise<Transaction>> = new LRU<
    string,
    Promise<Transaction>
  >(5)

  constructor(options: { strategy: Strategy }) {
    this.strategy = options.strategy
  }

  /**
   * Constructs a miners fee for an empty block at the given sequence
   *
   * @param sequence Block sequence to create the miners fee for
   * @param spendingKey Spend key of account to send the mining reward to
   * @returns
   */
  createEmptyMinersFee(sequence: number, account: SpendingAccount): Promise<Transaction> {
    const key = `${sequence}-${account.publicAddress}`

    const cached = this.cache.get(key)

    if (cached) {
      return cached
    }

    const minersFeePromise = this.strategy.createMinersFee(
      BigInt(0),
      sequence,
      account.spendingKey,
    )

    this.cache.set(key, minersFeePromise)

    return minersFeePromise
  }

  startCreatingEmptyMinersFee(sequence: number, account: SpendingAccount): void {
    const key = `${sequence}-${account.publicAddress}`

    const minersFeePromise = this.strategy.createMinersFee(
      BigInt(0),
      sequence,
      account.spendingKey,
    )

    this.cache.set(key, minersFeePromise)
  }
}
