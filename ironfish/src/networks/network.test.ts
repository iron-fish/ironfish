/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MAINNET } from './definitions'
import { Network } from './network'

describe('Network', () => {
  describe('miningReward', () => {
    it('miners reward is properly calculated for year 0-1', () => {
      const network = new Network(MAINNET)

      // for 60 second block time, miner's block reward in the first year should be 20 IRON
      const ironFishYearInBlocks =
        (365 * 24 * 60 * 60) / network.consensus.parameters.targetBlockTimeInSeconds

      let minersReward = network.miningReward(1)
      expect(minersReward).toBe(20 * 10 ** 8)

      minersReward = network.miningReward(ironFishYearInBlocks - 1)
      expect(minersReward).toBe(20 * 10 ** 8)
    })

    it('miners reward is properly calculated for year 1-2', () => {
      const network = new Network(MAINNET)

      // for 60 second block time, miner's block reward in the second year should be 19 IRON
      const ironFishYearInBlocks =
        (365 * 24 * 60 * 60) / network.consensus.parameters.targetBlockTimeInSeconds

      const minersReward = network.miningReward(ironFishYearInBlocks + 1)
      expect(minersReward).toBe(19 * 10 ** 8)
    })
  })
})
