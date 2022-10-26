/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useBlockWithTx, useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { GetFeesResponse } from './getFees'

describe('Route chain.getFees', () => {
  const routeTest = createRouteTest()

  it('should fail if no block is found', async () => {
    await expect(
      routeTest.client.request('fees/getFees', { numOfBlocks: 2 }).waitForEnd(),
    ).rejects.toThrow('numOfBlocks must be less than the current head sequence')
  })

  it('ignores miners fee from calculations', async () => {
    const node = routeTest.node

    const block = await useMinerBlockFixture(node.chain)
    await expect(node.chain).toAddBlock(block)

    const response = await routeTest.client
      .request<GetFeesResponse>('fees/getFees', { numOfBlocks: 2 })
      .waitForEnd()

    expect(response.content).toMatchObject({
      startBlock: 1,
      endBlock: 2,
      p25: '0',
      p50: '0',
      p75: '0',
    })
  })

  it('responds with fees', async () => {
    const node = routeTest.node

    const { block, transaction } = await useBlockWithTx(node)
    await expect(node.chain).toAddBlock(block)

    const response = await routeTest.client
      .request<GetFeesResponse>('fees/getFees', { numOfBlocks: 2 })
      .waitForEnd()

    expect(response.content).toMatchObject({
      startBlock: 2,
      endBlock: 3,
      p25: transaction.fee().toString(),
      p50: transaction.fee().toString(),
      p75: transaction.fee().toString(),
    })
  })
})
