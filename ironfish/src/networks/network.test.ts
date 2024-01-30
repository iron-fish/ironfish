/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Consensus } from '../consensus'
import { DEVNET } from './definitions'
import { Network } from './network'

describe('Network', () => {
  let network: Network

  beforeAll(() => {
    const consensus = new Consensus({
      allowedBlockFutureSeconds: 15,
      genesisSupplyInIron: 42000000,
      targetBlockTimeInSeconds: 60,
      targetBucketTimeInSeconds: 10,
      maxBlockSizeBytes: 512 * 1024,
      minFee: 1,
      enableAssetOwnership: 1,
      enforceSequentialBlockTime: 3,
      enableFishHash: 'never',
    })

    network = new Network(DEVNET, consensus)
  })

  describe('miningReward', () => {
    it('miners reward is properly calculated for year 0-1', () => {
      // for 60 second block time, miner's block reward in the first year should be 20 IRON
      const ironFishYearInBlocks =
        (365 * 24 * 60 * 60) / network.definition.consensus.targetBlockTimeInSeconds

      let minersReward = network.miningReward(1)
      expect(minersReward).toBe(20 * 10 ** 8)

      minersReward = network.miningReward(ironFishYearInBlocks - 1)
      expect(minersReward).toBe(20 * 10 ** 8)
    })

    it('miners reward is properly calculated for year 1-2', () => {
      // for 60 second block time, miner's block reward in the second year should be 19 IRON
      const ironFishYearInBlocks =
        (365 * 24 * 60 * 60) / network.definition.consensus.targetBlockTimeInSeconds

      const minersReward = network.miningReward(ironFishYearInBlocks + 1)
      expect(minersReward).toBe(19 * 10 ** 8)
    })
  })
})
