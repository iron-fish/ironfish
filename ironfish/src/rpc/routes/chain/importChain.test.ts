/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { Assert } from '../../../assert'
import { getBlockSize, writeBlock } from '../../../network/utils/block'
import { useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route chain/importSnapshot', () => {
  const routeTest = createRouteTest()
  it('given serialized blocks, it adds successfully adds them to the chain', async () => {
    const { chain, strategy } = routeTest
    await chain.open()
    strategy.disableMiningReward()

    const genesis = await chain.getBlock(chain.genesis)
    Assert.isNotNull(genesis)

    const blockA1 = await useMinerBlockFixture(chain, 2)
    const serializedBlockA1 = strategy.blockSerde.serialize(blockA1)
    const bw = bufio.write(getBlockSize(serializedBlockA1))
    const blockA1Buffer = writeBlock(bw, serializedBlockA1).render()

    const chunkWriter = bufio.write(8 + bufio.sizeVarBytes(blockA1Buffer))
    chunkWriter.writeU64(1)
    chunkWriter.writeVarBytes(blockA1Buffer)
    const buffer = chunkWriter.render()

    await routeTest.client.importSnapshot({ blocks: buffer })
    const head = await chain.getBlock(chain.head)
    await expect(head).toEqualBlock(blockA1)
  })
})
