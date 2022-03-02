/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Blockchain } from '../blockchain'
import { GENESIS_BLOCK_SEQUENCE } from '../consensus/consensus'
 
import { Strategy } from '../strategy'
import { makeDbPath } from '../testUtilities/helpers/storage'
import { WorkerPool } from '../workerPool'

describe('getBlockRange', () => {const workerPool = new WorkerPool()
  const strategy = new Strategy(workerPool)
  const chain = new Blockchain({ location: makeDbPath(), strategy })

  it('converts empty array to 0', async () => {
    //await chain.open()
    chain.latest.sequence = 10000
      console.log("hit the jackpot")
  })
})
