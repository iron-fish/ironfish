/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Assert } from '../../../assert'
import { getBlockSize, writeBlock } from '../../../network/utils/block'
import { useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { SnapshotChainStreamResponse } from './snapshotChain'

describe('Route chain/snapshotChainStream', () => {
  const routeTest = createRouteTest()

  it('correctly returns a serialized list of blocks', async () => {
    const { chain, strategy } = routeTest
    await chain.open()
    strategy.disableMiningReward()

    const genesis = await chain.getBlock(chain.genesis)
    Assert.isNotNull(genesis)

    const blockA1 = await useMinerBlockFixture(chain, 2)
    await expect(chain).toAddBlock(blockA1)
    expect(blockA1.transactions.length).toBe(1)

    const serializedGenesis = strategy.blockSerde.serialize(genesis)
    const bw1 = bufio.write(getBlockSize(serializedGenesis))
    const genesisBuffer = writeBlock(bw1, serializedGenesis).render()

    const serializedBlockA1 = strategy.blockSerde.serialize(blockA1)
    const bw2 = bufio.write(getBlockSize(serializedBlockA1))
    const blockA1Buffer = writeBlock(bw2, serializedBlockA1).render()

    const bw = bufio.write(
      8 + bufio.sizeVarBytes(genesisBuffer) + bufio.sizeVarBytes(blockA1Buffer),
    )
    bw.writeU64(2)
    bw.writeVarBytes(genesisBuffer)
    bw.writeVarBytes(blockA1Buffer)
    const expected = bw.render()

    const response = await routeTest.client
      .request<SnapshotChainStreamResponse>('chain/snapshotChainStream', { start: 1, stop: 2 })
      .waitForRoute()

    let value = await response.contentStream().next()
    expect(response.status).toBe(200)

    value = await response.contentStream().next()
    expect(response.status).toBe(200)

    expect(value).toMatchObject({
      value: {
        buffer: expected,
        seq: 2,
      },
    })
  })
})
