/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IronfishStrategy } from './'
describe('Miners reward', () => {
  let strategy: IronfishStrategy
  beforeAll(() => {
    strategy = new IronfishStrategy()
  })

  // see https://ironfish.network/docs/whitepaper/4_mining#include-the-miner-reward-based-on-coin-emission-schedule
  // for more details
  it('miners reward is properly calculated for year 0-1', () => {
    let minersReward = strategy.miningReward(BigInt(1))
    expect(minersReward).toBe(5 * 10 ** 8)

    minersReward = strategy.miningReward(BigInt(100000))
    expect(minersReward).toBe(5 * 10 ** 8)
  })

  it('miners reward is properly calculated for year 1-2', () => {
    const minersReward = strategy.miningReward(BigInt(2100001))
    expect(minersReward).toBe(475614712)
  })
})
