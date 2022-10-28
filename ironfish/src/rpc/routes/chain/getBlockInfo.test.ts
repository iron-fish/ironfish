/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import { makeBlockAfter } from '../../../testUtilities/helpers/blockchain'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route chain/getBlockInfo',  () => { //no async here?
  const routeTest = createRouteTest()

  // Create a 2 block chain
    const { chain, strategy } = routeTest
    await chain.open()
    strategy.disableMiningReward()

    const genesis = await chain.getBlock(chain.genesis)
    Assert.isNotNull(genesis)

    const blockA1 = await makeBlockAfter(chain, genesis)
    await expect(chain).toAddBlock(blockA1)
    
    // does the original function force hash to one?
    // Do we need to add an optional parameter to change hash at creation?
    /*
  describe('Hash input', () => {
    it('test 1', async () => {
    })
    
    it('test 2', async () => {
    })

    it('test 3', async () => {
    })

    it('test 4', async () => {
    })
  })
  
  describe('Sequence input', () => {
    // Both with negative numbers and with actual sequence values
    it('Underflow', async () => {
    })
    
    it('Sequence = 0', async () => {
    })

    it('Overflow', async () => {
    })

    it('In Range', async () => {
    })

    it('Negative', async () => {
    })
  })
  */
})

