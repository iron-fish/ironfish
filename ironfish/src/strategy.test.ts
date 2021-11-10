/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IRON_FISH_YEAR_IN_BLOCKS } from './consensus'
import { Strategy } from './strategy'
import { WorkerPool } from './workerPool'

describe('Miners reward', () => {
  let strategy: Strategy

  beforeAll(() => {
    strategy = new Strategy(new WorkerPool())
  })

  // see https://ironfish.network/docs/whitepaper/4_mining#include-the-miner-reward-based-on-coin-emission-schedule
  // for more details

  // for 60 second block time, miner's block reward in the first year should be 20 IRON
  it('miners reward is properly calculated for year 0-1', () => {
    let minersReward = strategy.miningReward(1)
    expect(minersReward).toBe(20 * 10 ** 8)

    minersReward = strategy.miningReward(IRON_FISH_YEAR_IN_BLOCKS - 1)
    expect(minersReward).toBe(20 * 10 ** 8)
  })

  // for 60 second block time, miner's block reward in the second year should be 19 IRON
  it('miners reward is properly calculated for year 1-2', () => {
    const minersReward = strategy.miningReward(IRON_FISH_YEAR_IN_BLOCKS + 1)
    expect(minersReward).toBe(19 * 10 ** 8)
  })
})
