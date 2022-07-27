/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createNodeTest } from '../testUtilities/nodeTest'
import { getBlockRange } from './blockchain'

// Strategy for testing:
// Consider a line of numbers to pick for the input parameters
// <-----N1---N2----0G---P1---P2---H---X1---X2----->
// N1, N2 are negative (count backward from height)
// G is the genesis block (1)
// P1 and P2 are positive numbers in the range of blocks
// H is the height of the chain
// X1 and X2 exceed the height of the chain
describe('getBlockRange', () => {
  const nodeTest = createNodeTest()

  it.each([
    // P1, P2 cases
    [{ start: 9000, stop: 900 }, 9000, 9000],
    [{ start: 900, stop: 9000 }, 900, 9000],

    // N1, N2 cases
    [{ start: -9000, stop: -8000 }, 1000, 2000],
    [{ start: -8000, stop: -9000 }, 2000, 2000],

    // N, P cases
    [{ start: -9000, stop: 3000 }, 1000, 3000],
    [{ start: 3000, stop: -9000 }, 3000, 3000],
    [{ start: 1000, stop: -7000 }, 1000, 3000],
    [{ start: -7000, stop: 1000 }, 3000, 3000],

    // N, 0 cases
    [{ start: -9000, stop: 0 }, 1000, 10000],
    [{ start: 0, stop: -9000 }, 1, 1000],

    // P, 0 cases
    [{ start: 40, stop: 0 }, 40, 10000],
    [{ start: 0, stop: 40 }, 1, 40],

    // H, 0 cases
    [{ start: 10000, stop: 0 }, 10000, 10000],
    [{ start: 0, stop: 10000 }, 1, 10000],

    // P, H cases
    [{ start: 100, stop: 10000 }, 100, 10000],
    [{ start: 10000, stop: 100 }, 10000, 10000],

    // X1, X2 cases
    [{ start: 11000, stop: 12000 }, 10000, 10000],
    [{ start: 12000, stop: 11000 }, 10000, 10000],

    // N, H cases
    [{ start: -9000, stop: 10000 }, 1000, 10000],
    [{ start: 10000, stop: -9000 }, 10000, 10000],

    // N1, N2 cases: |N1| > H
    [{ start: -17000, stop: -8000 }, 1, 2000],
    [{ start: -8000, stop: -17000 }, 2000, 2000],

    // N1, N2 cases: |N1| > H, |N2| > H
    [{ start: -17000, stop: -18000 }, 1, 1],
    [{ start: -18000, stop: -17000 }, 1, 1],

    // Fractional cases
    [{ start: 3.14, stop: 6.28 }, 3, 6],
    [{ start: 6.28, stop: 3.14 }, 6, 6],
  ])('%o returns %d %d', (param, expectedStart, expectedStop) => {
    nodeTest.chain.latest.sequence = 10000

    const { start, stop } = getBlockRange(nodeTest.chain, param)
    expect(start).toEqual(expectedStart)
    expect(stop).toEqual(expectedStop)
  })

  it('{ start: null, stop: 6000 } returns 1 6000', () => {
    nodeTest.chain.latest.sequence = 10000

    const { start, stop } = getBlockRange(nodeTest.chain, { start: null, stop: 6000 })
    expect(start).toEqual(1)
    expect(stop).toEqual(6000)
  })

  it('{ start: 6000, stop: null } returns 6000 10000', () => {
    nodeTest.chain.latest.sequence = 10000

    const { start, stop } = getBlockRange(nodeTest.chain, { start: 6000, stop: null })
    expect(start).toEqual(6000)
    expect(stop).toEqual(10000)
  })
})
