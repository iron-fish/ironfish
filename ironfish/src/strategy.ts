/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GENESIS_SUPPLY_IN_IRON, IRON_FISH_YEAR_IN_BLOCKS } from './consensus'
import { Transaction } from './primitives/transaction'
import { MathUtils } from './utils'
import { WorkerPool } from './workerPool'

/**
 * Implementation of a Blockchain Strategy using zero-knowledge proofs.
 */
export class Strategy {
  readonly workerPool: WorkerPool

  private miningRewardCachedByYear: Map<number, number>

  constructor(workerPool: WorkerPool) {
    this.miningRewardCachedByYear = new Map<number, number>()
    this.workerPool = workerPool
  }

  /**
   * Calculate the mining reward for a block based on its sequence
   *
   * See https://ironfish.network/docs/whitepaper/4_mining#include-the-miner-reward-based-on-coin-emission-schedule
   *
   * Annual coin issuance from mining goes down every year. Year is defined here by the
   * number of blocks (IRON_FISH_YEAR_IN_BLOCKS)
   *
   * Given the genesis block supply (GENESIS_SUPPLY_IN_IRON) the formula to calculate
   * reward per block is:
   * (genesisSupply / 4) * e ^(-.05 * yearsAfterLaunch)
   * Where e is the natural number e (Euler's number), and -.05 is a decay function constant
   *
   * @param sequence Block sequence
   * @returns mining reward (in ORE) per block given the block sequence
   */
  miningReward(sequence: number): number {
    const yearsAfterLaunch = Math.floor(Number(sequence) / IRON_FISH_YEAR_IN_BLOCKS)

    let reward = this.miningRewardCachedByYear.get(yearsAfterLaunch)
    if (reward) {
      return reward
    }

    const annualReward = (GENESIS_SUPPLY_IN_IRON / 4) * Math.E ** (-0.05 * yearsAfterLaunch)

    reward = this.convertIronToOre(
      MathUtils.roundBy(annualReward / IRON_FISH_YEAR_IN_BLOCKS, 0.125),
    )

    this.miningRewardCachedByYear.set(yearsAfterLaunch, reward)

    return reward
  }

  convertIronToOre(iron: number): number {
    return Math.round(iron * 10 ** 8)
  }

  /**
   * Create the miner's fee transaction for a given block.
   *
   * The miner's fee is a special transaction with one receipt and
   * zero spends. It's receipt value must be the total transaction fees
   * in the block plus the mining reward for the block.
   *
   * The mining reward may change over time, so we accept the block sequence
   * to calculate the mining reward from.
   *
   * @param totalTransactionFees is the sum of the transaction fees intended to go
   * in this block.
   * @param blockSequence the sequence of the block for which the miner's fee is being created
   * @param minerKey the spending key for the miner.
   */
  async createMinersFee(
    totalTransactionFees: bigint,
    blockSequence: number,
    minerSpendKey: string,
  ): Promise<Transaction> {
    // Create a new note with value equal to the inverse of the sum of the
    // transaction fees and the mining reward
    const amount = totalTransactionFees + BigInt(this.miningReward(blockSequence))

    return this.workerPool.createMinersFee(minerSpendKey, amount, '')
  }
}
