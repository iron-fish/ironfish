/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import { makeBlockAfter } from '../../../testUtilities/helpers/blockchain'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { GetBlockInfoResponse } from './getBlockInfo'
import { ERROR_CODES } from '../../adapters'
import { RpcRequestError } from '../../clients/errors'

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
    const hash1 = blockA1.header.hash.toString('hex') // "9de985c7492bd000d6a8312f7592737e869967c890aac22247ede00678d4a2b2"
    //const hash2 = blockA2.header.hash.toString('hex') // cd9

    //Find block matching hash
    let response = await routeTest.client
      .request<GetBlockInfoResponse>('chain/getBlockInfo', { search: hash0 })
      .waitForEnd()

    expect(response.content).toMatchObject({
        block: {
          hash: hash0,
          sequence: 1,
        },
    })

    //Now miss on a hash check.
    try {
      expect.assertions(3)
      await routeTest.client
      .request<GetBlockInfoResponse>('chain/getBlockInfo', { search: "123405c7492bd000d6a8312f7592737e869967c890aac22247ede00678d4a2b2" })
      .waitForEnd()
    } catch (e: unknown) {
      if (!(e instanceof RpcRequestError)) {
        throw e
      }
      expect(e.status).toBe(400)
      expect(e.code).toBe(ERROR_CODES.VALIDATION)
      expect(e.message).toContain('No block found with hash')
      
    }    

    //Find block matching sequence
    response = await routeTest.client
      .request<GetBlockInfoResponse>('chain/getBlockInfo', { search : "2" })
      .waitForEnd()

    expect(response.content).toMatchObject({
        block: {
          hash: hash1,
          sequence: 2,
        },
    })

    //Now miss on a sequence check.
    try {
      expect.assertions(3+6)
      await routeTest.client
      .request<GetBlockInfoResponse>('chain/getBlockInfo', { search: "1234" })
      .waitForEnd()
    } catch (e: unknown) {
      if (!(e instanceof RpcRequestError)) {
        throw e
      }
      expect(e.status).toBe(400)
      expect(e.code).toBe(ERROR_CODES.VALIDATION)
      expect(e.message).toContain('No block found with sequence')
    }

  })

  //it('Processes sequence input', async () => {
})
