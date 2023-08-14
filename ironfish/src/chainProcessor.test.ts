/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ChainProcessor } from './chainProcessor'
import { BlockHeader } from './primitives/blockheader'
import { createNodeTest, useMinerBlockFixture } from './testUtilities'

describe('ChainProcessor', () => {
  const nodeTest = createNodeTest()

  it('processes chain', async () => {
    const { chain } = nodeTest

    const { node: nodeA } = await nodeTest.createSetup()
    const { node: nodeB } = await nodeTest.createSetup()

    const blockA1 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA1)
    const blockA2 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA2)
    const blockA3 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA3)

    const blockB1 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB2)

    const processor = new ChainProcessor({
      chain: chain,
      head: chain.genesis.hash,
    })

    const onEvent: jest.Mock<void, [BlockHeader, 'add' | 'remove']> = jest.fn()
    processor.onAdd.on((block) => onEvent(block, 'add'))
    processor.onRemove.on((block) => onEvent(block, 'remove'))

    await processor.update()
    expect(onEvent).toHaveBeenCalledTimes(0)

    // G -> A1
    await expect(chain).toAddBlock(blockA1)

    await processor.update()
    expect(processor.hash?.equals(blockA1.header.hash)).toBe(true)
    expect(onEvent).toHaveBeenNthCalledWith(1, blockA1.header, 'add')
    expect(onEvent).toHaveBeenCalledTimes(1)

    // G -> A1
    //   -> B1 -> B2
    await expect(chain).toAddBlock(blockB1)
    await expect(chain).toAddBlock(blockB2)

    await processor.update()
    expect(processor.hash?.equals(blockB2.header.hash)).toBe(true)
    expect(onEvent).toHaveBeenNthCalledWith(2, blockA1.header, 'remove')
    expect(onEvent).toHaveBeenNthCalledWith(3, blockB1.header, 'add')
    expect(onEvent).toHaveBeenNthCalledWith(4, blockB2.header, 'add')
    expect(onEvent).toHaveBeenCalledTimes(4)

    // G -> A1 -> A2 -> A3
    //   -> B1 -> B2
    await expect(chain).toAddBlock(blockA2)
    await expect(chain).toAddBlock(blockA3)

    await processor.update()
    expect(processor.hash?.equals(blockA3.header.hash)).toBe(true)
    expect(onEvent).toHaveBeenNthCalledWith(5, blockB2.header, 'remove')
    expect(onEvent).toHaveBeenNthCalledWith(6, blockB1.header, 'remove')
    expect(onEvent).toHaveBeenNthCalledWith(7, blockA1.header, 'add')
    expect(onEvent).toHaveBeenNthCalledWith(8, blockA2.header, 'add')
    expect(onEvent).toHaveBeenNthCalledWith(9, blockA3.header, 'add')
    expect(onEvent).toHaveBeenCalledTimes(9)
  })

  it('handles rewinding', async () => {
    const { chain } = nodeTest

    const processor = new ChainProcessor({
      chain: chain,
      head: chain.genesis.hash,
    })

    const onEvent: jest.Mock<void, [BlockHeader, 'add' | 'remove']> = jest.fn()
    processor.onAdd.on((block) => onEvent(block, 'add'))
    processor.onRemove.on((block) => onEvent(block, 'remove'))

    await processor.update()
    expect(onEvent).toHaveBeenCalledTimes(0)

    // G -> A1 -> A2 -> A3
    const blockA1 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(blockA1)
    const blockA2 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(blockA2)
    const blockA3 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(blockA3)

    await processor.update()
    expect(processor.hash?.equals(blockA3.header.hash)).toBe(true)

    await chain.blockchainDb.db.transaction(async (tx) => {
      await chain.disconnect(blockA3, tx)
      await chain.disconnect(blockA2, tx)
    })

    expect(chain.head.hash).toEqual(blockA1.header.hash)

    await processor.update()
    expect(processor.hash?.equals(blockA1.header.hash)).toBe(true)
    expect(onEvent).toHaveBeenNthCalledWith(4, blockA3.header, 'remove')
    expect(onEvent).toHaveBeenNthCalledWith(5, blockA2.header, 'remove')
  })

  it('cancels updates when abort signal is triggered', async () => {
    const { chain } = nodeTest

    const blockA1 = await useMinerBlockFixture(chain)

    await expect(chain).toAddBlock(blockA1)
    expect(chain.head.hash).toEqual(blockA1.header.hash)

    const ac = new AbortController()

    const processor = new ChainProcessor({
      chain: chain,
      head: chain.genesis.hash,
    })

    const updatePromise = processor.update({ signal: ac.signal })

    // abort should trigger before any blocks have been loaded
    ac.abort()

    const result = await updatePromise

    expect(result.hashChanged).toEqual(false)
    expect(processor.hash).toEqual(chain.genesis.hash)
  })
})
