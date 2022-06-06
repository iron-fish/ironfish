/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import { makeBlockAfter } from '../../../testUtilities/helpers/blockchain'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route chain/exportChainStream', () => {
  const routeTest = createRouteTest()

  it('correctly exports the second block on chain', async () => {
    const { chain, strategy } = routeTest
    await chain.open()
    strategy.disableMiningReward()

    const genesis = await chain.getBlock(chain.genesis)
    Assert.isNotNull(genesis)

    const blockA1 = await makeBlockAfter(chain, genesis)
    await expect(chain).toAddBlock(blockA1)

    const response = await routeTest.client
      .request('chain/exportChainStream', { start: 1, stop: 2 })
      .waitForRoute()

    //Receive and discard the first response (from getBlockRange)
    let value = await response.contentStream().next()
    expect(response.status).toBe(200)

    // Receive and discard the genesis block
    value = await response.contentStream().next()
    expect(response.status).toBe(200)

    //Receive the second block
    value = await response.contentStream().next()
    expect(response.status).toBe(200)

    //Test contents of second block. Hash seems to be regenerated differently each run.
    expect(value).toMatchObject({
      value: {
        block: {
          head: true,
          hash: blockA1.header.hash.toString('hex'),
          prev: genesis.header.hash.toString('hex'),
          seq: 2,
        },
      },
    })
  })
})
