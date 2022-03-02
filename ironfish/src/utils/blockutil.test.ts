/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Blockchain } from '../blockchain'
import { GENESIS_BLOCK_SEQUENCE } from '../consensus/consensus'
import { Strategy } from '../strategy'
import { makeDbPath } from '../testUtilities/helpers/storage'
import { WorkerPool } from '../workerPool'
import { getBlockRange } from './blockchain'

// Strategy for testing:
// Consider a line of numbers to choose for the input parameters
// <-----N1---N2----0G---P1---P2---H---X1---X2----->
// Where N1, N2 are negative
// G is the genesis block (1)
// P1 and P2 are positive numbers in the range of blocks
// H is the height of the chain
// X1 and X2 exceed the height of the chain

describe('getBlockRange', () => {
  const workerPool = new WorkerPool()
  const strategy = new Strategy(workerPool)
  const chain = new Blockchain({ location: makeDbPath(), strategy })

  it('Initialization', async () => {
    await chain.open()
    chain.latest.sequence = 10000
  })

  it('prototype', () => {
    const param = { start: 2000, stop: 200 }

    const { start, stop } = getBlockRange(chain, param)
    expect(start).toEqual(param.start)
    expect(stop).toEqual(param.start)
  })

  it('G < b < e < M', () => {
    const param = { start: 200, stop: 2000 }

    const { start, stop } = getBlockRange(chain, param)
    expect(start).toEqual(param.start)
    expect(stop).toEqual(param.stop)
  })
})
