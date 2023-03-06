/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Consensus, ConsensusParameters } from './consensus'
import { Strategy } from './strategy'
import { WorkerPool } from './workerPool'

describe('Miners reward', () => {
  let strategy: Strategy

  const consensusParameters: ConsensusParameters = {
    allowedBlockFutureSeconds: 15,
    genesisSupplyInIron: 42000000,
    targetBlockTimeInSeconds: 60,
    targetBucketTimeInSeconds: 10,
    maxBlockSizeBytes: 512 * 1024,
    minFee: 1,
  }

  beforeAll(() => {
    strategy = new Strategy({
      workerPool: new WorkerPool(),
      consensus: new Consensus(consensusParameters),
    })
  })

  // see https://ironfish.network/docs/whitepaper/4_mining#include-the-miner-reward-based-on-coin-emission-schedule
  // for more details

  // for 60 second block time, miner's block reward in the first year should be 20 IRON
  it('miners reward is properly calculated for year 0-1', () => {
    const ironFishYearInBlocks =
      (365 * 24 * 60 * 60) / consensusParameters.targetBlockTimeInSeconds

    let minersReward = strategy.miningReward(1)
    expect(minersReward).toBe(20 * 10 ** 8)

    minersReward = strategy.miningReward(ironFishYearInBlocks - 1)
    expect(minersReward).toBe(20 * 10 ** 8)
  })

  // for 60 second block time, miner's block reward in the second year should be 19 IRON
  it('miners reward is properly calculated for year 1-2', () => {
    const ironFishYearInBlocks =
      (365 * 24 * 60 * 60) / consensusParameters.targetBlockTimeInSeconds

    const minersReward = strategy.miningReward(ironFishYearInBlocks + 1)
    expect(minersReward).toBe(19 * 10 ** 8)
  })
})
