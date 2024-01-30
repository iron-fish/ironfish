/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { Consensus } from '../consensus'
import { MathUtils } from '../utils'
import { defaultNetworkName, isDefaultNetworkId, NetworkDefinition } from './networkDefinition'

export class Network {
  readonly default: boolean
  readonly name: string
  readonly id: number
  readonly definition: NetworkDefinition
  readonly consensus: Consensus

  private miningRewardCachedByYear = new Map<number, number>()

  constructor(definition: NetworkDefinition, consensus: Consensus) {
    this.id = definition.id
    this.default = isDefaultNetworkId(definition.id)
    this.definition = definition
    this.consensus = consensus

    if (this.default) {
      const defaultName = defaultNetworkName(definition.id)
      Assert.isNotUndefined(defaultName)
      this.name = defaultName
    } else {
      this.name = `Custom Network ${definition.id}`
    }
  }

  /**
   * Calculate the mining reward for a block based on its sequence
   *
   * See https://ironfish.network/docs/whitepaper/4_mining#include-the-miner-reward-based-on-coin-emission-schedule
   *
   * Annual coin issuance from mining goes down every year. Year is defined here by the
   * number of blocks
   *
   * Given the genesis block supply (genesisSupplyInIron) the formula to calculate
   * reward per block is:
   * (genesisSupply / 4) * e ^(-.05 * yearsAfterLaunch)
   * Where e is the natural number e (Euler's number), and -.05 is a decay function constant
   *
   * @param sequence Block sequence
   * @returns mining reward (in ORE) per block given the block sequence
   */
  miningReward(sequence: number): number {
    const ironFishYearInBlocks =
      (365 * 24 * 60 * 60) / this.definition.consensus.targetBlockTimeInSeconds
    const yearsAfterLaunch = Math.floor(Number(sequence) / ironFishYearInBlocks)

    let reward = this.miningRewardCachedByYear.get(yearsAfterLaunch)
    if (reward) {
      return reward
    }

    const annualReward =
      (this.definition.consensus.genesisSupplyInIron / 4) * Math.E ** (-0.05 * yearsAfterLaunch)

    // This rounds and produces an incorrect result but must
    // be kept because it would cause a hard fork once you reach
    // a floating point reward. This should have used the logic
    // in CurrencyUtils.decodeIron. This entire function should
    // have only done this math in ore amounts.
    function convertIronToOre(iron: number): number {
      return Math.round(iron * 10 ** 8)
    }

    reward = convertIronToOre(MathUtils.roundBy(annualReward / ironFishYearInBlocks, 0.125))

    this.miningRewardCachedByYear.set(yearsAfterLaunch, reward)

    return reward
  }
}
