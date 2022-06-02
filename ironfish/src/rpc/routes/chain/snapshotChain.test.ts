/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Assert } from '../../../assert'
import { getBlockSize, writeBlock } from '../../../network/utils/block'
import { makeBlockAfter } from '../../../testUtilities/helpers/blockchain'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { SnapshotChainStreamResponse } from './snapshotChain'

describe('Route chain/snapshotChainStream', () => {
  const routeTest = createRouteTest()

  it('correctly a block buffer', async () => {
    const { chain, strategy } = routeTest
    await chain.open()
    strategy.disableMiningReward()

    const genesis = await chain.getBlock(chain.genesis)
    Assert.isNotNull(genesis)

    const blockA1 = await makeBlockAfter(chain, genesis)
    await expect(chain).toAddBlock(blockA1)

    const response = await routeTest.client
      .request<SnapshotChainStreamResponse>('chain/snapshotChainStream', { start: 1, stop: 2 })
      .waitForRoute()

    let value = await response.contentStream().next()
    expect(response.status).toBe(200)

    value = await response.contentStream().next()
    expect(response.status).toBe(200)

    value = await response.contentStream().next()
    expect(response.status).toBe(200)

    const serializedBlock = strategy.blockSerde.serialize(blockA1)
    const bw = bufio.write(getBlockSize(serializedBlock))
    const blockBuffer = writeBlock(bw, serializedBlock).render()
    expect(value).toMatchObject({
      value: {
        blockBuffer,
        seq: 2,
      },
    })
  })
})
