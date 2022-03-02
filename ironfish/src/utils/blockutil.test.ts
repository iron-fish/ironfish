/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Blockchain } from '../blockchain'
import { GENESIS_BLOCK_SEQUENCE } from '../consensus/consensus'
 
import { Strategy } from '../strategy'
import { makeDbPath } from '../testUtilities/helpers/storage'
import { WorkerPool } from '../workerPool'
import { getBlockRange } from './blockchain'


describe('getBlockRange', () => {const workerPool = new WorkerPool()
  const strategy = new Strategy(workerPool)
  const chain = new Blockchain({ location: makeDbPath(), strategy })

  it('Initialization', async () => {
    await chain.open()
    chain.latest.sequence = 10000
  })

  it('prototype', async () => {
    const param = {start: 2000, stop: 200}

    //const {start, stop } = getBlockRange(chain, {start: 2000, stop: 200 })
    const {start, stop } = getBlockRange(chain, param)
      
    expect(start).toEqual(2000)    
    expect(stop).toEqual(2000)
  })

  it('G < b < e < M', async () => {
    const param = {start: 200, stop: 2000}

    const {start, stop } = getBlockRange(chain, param)
      
    expect(start).toEqual(200)    
    expect(stop).toEqual(2000)
  })
})
