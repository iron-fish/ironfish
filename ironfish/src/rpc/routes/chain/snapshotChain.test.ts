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

  describe('with no maxBlocksPerChunk parameter', () => {
    it('correctly returns a serialized list of blocks', async () => {
      const { chain, strategy } = routeTest
      await chain.open()
      strategy.disableMiningReward()

      const genesis = await chain.getBlock(chain.genesis)
      Assert.isNotNull(genesis)

      const blockA1 = await useMinerBlockFixture(chain, 2)
      await expect(chain).toAddBlock(blockA1)
      expect(blockA1.transactions.length).toBe(1)

      const serializedBlockA1 = strategy.blockSerde.serialize(blockA1)
      const bw2 = bufio.write(getBlockSize(serializedBlockA1))
      const blockA1Buffer = writeBlock(bw2, serializedBlockA1).render()

      const bw = bufio.write(8 + bufio.sizeVarBytes(blockA1Buffer))
      bw.writeU64(1)
      bw.writeVarBytes(blockA1Buffer)
      const expected = bw.render()

      const response = await routeTest.client
        .request<SnapshotChainStreamResponse>('chain/snapshotChainStream')
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

  describe('with maxBlocksPerChunk parameter', () => {
    it('correctly returns a serialized list with the desired number of blocks', async () => {
      const { chain, strategy } = routeTest
      await chain.open()
      strategy.disableMiningReward()

      const genesis = await chain.getBlock(chain.genesis)
      Assert.isNotNull(genesis)

      const blockA1 = await useMinerBlockFixture(chain, 2)
      await expect(chain).toAddBlock(blockA1)
      const blockA2 = await useMinerBlockFixture(chain, 3)
      await expect(chain).toAddBlock(blockA2)

      const serializedBlockA1 = strategy.blockSerde.serialize(blockA1)
      const bw1 = bufio.write(getBlockSize(serializedBlockA1))
      const blockA1Buffer = writeBlock(bw1, serializedBlockA1).render()
      const serializedBlockA2 = strategy.blockSerde.serialize(blockA2)
      const bw2 = bufio.write(getBlockSize(serializedBlockA2))
      const blockA2Buffer = writeBlock(bw2, serializedBlockA2).render()

      const chunkWriter1 = bufio.write(8 + bufio.sizeVarBytes(blockA1Buffer))
      chunkWriter1.writeU64(1)
      chunkWriter1.writeVarBytes(blockA1Buffer)
      const expected1 = chunkWriter1.render()

      const chunkWriter2 = bufio.write(8 + bufio.sizeVarBytes(blockA2Buffer))
      chunkWriter2.writeU64(1)
      chunkWriter2.writeVarBytes(blockA2Buffer)
      const expected2 = chunkWriter2.render()

      const response = await routeTest.client
        .request<SnapshotChainStreamResponse>('chain/snapshotChainStream', {
          maxBlocksPerChunk: 1,
        })
        .waitForRoute()

      let value = await response.contentStream().next()
      expect(response.status).toBe(200)

      value = await response.contentStream().next()
      expect(response.status).toBe(200)

      expect(value).toMatchObject({
        value: {
          buffer: expected1,
          seq: 2,
        },
      })

      value = await response.contentStream().next()
      expect(response.status).toBe(200)

      expect(value).toMatchObject({
        value: {
          buffer: expected2,
          seq: 3,
        },
      })
    })
  })
})
