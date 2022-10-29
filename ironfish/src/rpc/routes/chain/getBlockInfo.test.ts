/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import { makeBlockAfter } from '../../../testUtilities/helpers/blockchain'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { GetBlockInfoResponse } from './getBlockInfo'

describe('Route chain/getBlockInfo', () => {
  const routeTest = createRouteTest()

  it('Processes hash input', async () => {
    // Create a 3 block chain
    const { chain, strategy } = routeTest
    await chain.open()
    strategy.disableMiningReward()

    const genesis = await chain.getBlock(chain.genesis)
    Assert.isNotNull(genesis)

    const blockA1 = await makeBlockAfter(chain, genesis)
    await expect(chain).toAddBlock(blockA1)

    const blockA2 = await makeBlockAfter(chain, blockA1)
    await expect(chain).toAddBlock(blockA2)

    //Get hash of blocks
    const hash0 = genesis.header.hash.toString('hex') // 69e
    const hash1 = blockA1.header.hash.toString('hex') // 589
    const hash2 = blockA2.header.hash.toString('hex') // cd9

    //Find block matching hash
    const response = await routeTest.client
      .request<GetBlockInfoResponse>('chain/getBlockInfo', { search: hash0 })
      .waitForEnd()

    expect(response.status).toBe(200)
    //expect(response.content.block.hash).toEqual(hash0)
    expect(response.content).toMatchObject({
        block: {
          hash: hash0,
          sequence: 1,
        },
    })
  })

  //it('Processes sequence input', async () => {
})
