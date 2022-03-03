/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Blockchain } from '../blockchain'
import { Strategy } from '../strategy'
import { makeDbPath } from '../testUtilities/helpers/storage'
import { WorkerPool } from '../workerPool'
import { getBlockRange } from './blockchain'

// Strategy for testing:
// Consider a line of numbers to choose for the input parameters
// <-----N1---N2----0G---P1---P2---H---X1---X2----->
// Where N1, N2 are negative (count backward from height)
// G is the genesis block (1)
// P1 and P2 are positive numbers in the range of blocks
// H is the height of the chain
// X1 and X2 exceed the height of the chain

// Notes for documentation:
// Zeroes get immediately converted to min/max in the function

// Blockchain is needed by getBlockRange()
// Set it up before running tests
const workerPool = new WorkerPool()
const strategy = new Strategy(workerPool)
const chain = new Blockchain({ location: makeDbPath(), strategy })

beforeAll(async () => {
  await chain.open()
  chain.latest.sequence = 10000
})

describe.each([
  // P1, P2 cases
  { param: { start: 9000, stop: 900 }, expectedStart: 9000, expectedStop: 9000 },
  { param: { start: 900, stop: 9000 }, expectedStart: 900, expectedStop: 9000 },

  // N1, N2 cases
  { param: { start: -9000, stop: -8000 }, expectedStart: 1000, expectedStop: 2000 },
  { param: { start: -8000, stop: -9000 }, expectedStart: 2000, expectedStop: 2000 },

  // N, P cases
  { param: { start: -9000, stop: 3000 }, expectedStart: 1000, expectedStop: 3000 },
  { param: { start: 3000, stop: -9000 }, expectedStart: 3000, expectedStop: 3000 },

  { param: { start: 1000, stop: -7000 }, expectedStart: 1000, expectedStop: 3000 },
  { param: { start: -7000, stop: 1000 }, expectedStart: 3000, expectedStop: 3000 },

  // N, 0 cases
  { param: { start: -9000, stop: 0 }, expectedStart: 1000, expectedStop: 10000 },
  { param: { start: 0, stop: -9000 }, expectedStart: 1, expectedStop: 1000 },

  // P, 0 cases
  { param: { start: 40, stop: 0 }, expectedStart: 40, expectedStop: 10000 },
  { param: { start: 0, stop: 40 }, expectedStart: 1, expectedStop: 40 },

  // H, 0 cases
  { param: { start: 10000, stop: 0 }, expectedStart: 10000, expectedStop: 10000 },
  { param: { start: 0, stop: 10000 }, expectedStart: 1, expectedStop: 10000 },

  // P, H cases
  { param: { start: 100, stop: 10000 }, expectedStart: 100, expectedStop: 10000 },
  { param: { start: 10000, stop: 100 }, expectedStart: 10000, expectedStop: 10000 },

  // X1, X2 cases
  { param: { start: 11000, stop: 12000 }, expectedStart: 10000, expectedStop: 10000 },
  { param: { start: 12000, stop: 11000 }, expectedStart: 10000, expectedStop: 10000 },

  // N, H cases
  { param: { start: -9000, stop: 10000 }, expectedStart: 1000, expectedStop: 10000 },
  { param: { start: 10000, stop: -9000 }, expectedStart: 10000, expectedStop: 10000 },

  // N1, N2 cases. |N1| > H
  { param: { start: -17000, stop: -8000 }, expectedStart: 1, expectedStop: 2000 },
  { param: { start: -8000, stop: -17000 }, expectedStart: 2000, expectedStop: 2000 },

  // N1, N2 cases. |N1| > H, |N2| > H
  { param: { start: -17000, stop: -18000 }, expectedStart: 1, expectedStop: 1 },
  { param: { start: -18000, stop: -17000 }, expectedStart: 1, expectedStop: 1 },

  // null cases
  { param: { start: null, stop: 6000 }, expectedStart: 1, expectedStop: 6000 },
  { param: { start: 6000, stop: null }, expectedStart: 6000, expectedStop: 10000 },

  // fractional cases
  { param: { start: 3.14, stop: 6.28 }, expectedStart: 3, expectedStop: 6 },
  { param: { start: 6.28, stop: 3.14 }, expectedStart: 6, expectedStop: 6 },
])('getBlockRange', ({ param, expectedStart, expectedStop }) => {
  test(`${param.start}, ${param.stop} returns ${expectedStart} ${expectedStop}`, () => {
    const { start, stop } = getBlockRange(chain, param)
    expect(start).toEqual(expectedStart)
    expect(stop).toEqual(expectedStop)
  })
})

//jkTODO add separate null tests to placate lint?
