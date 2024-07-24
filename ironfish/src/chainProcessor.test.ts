/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Mock } from 'jest-mock'
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

    const onEvent: Mock<(header: BlockHeader, event: 'add' | 'remove') => void> = jest.fn()
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

    const onEvent: Mock<(header: BlockHeader, event: 'add' | 'remove') => void> = jest.fn()
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

  it('limits blocks processed with maxQueueSize', async () => {
    const { chain } = nodeTest

    const block1 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block1)
    const block2 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block2)

    expect(chain.head.hash).toEqual(block2.header.hash)

    const onEvent: Mock<(header: BlockHeader, event: 'add' | 'remove') => void> = jest.fn()

    const processor = new ChainProcessor({ chain, head: null })
    processor.onAdd.on((block) => onEvent(block, 'add'))
    processor.onRemove.on((block) => onEvent(block, 'remove'))

    processor.hash = chain.genesis.hash
    processor.maxQueueSize = 1
    await processor.update()
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenNthCalledWith(1, block1.header, 'add')

    onEvent.mockReset()

    processor.hash = chain.genesis.hash
    processor.maxQueueSize = null
    await processor.update()
    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(onEvent).toHaveBeenNthCalledWith(1, block1.header, 'add')
    expect(onEvent).toHaveBeenNthCalledWith(2, block2.header, 'add')
  })

  it('should remain stable if hash is head', async () => {
    const { chain } = nodeTest

    const block = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block)
    expect(chain.head.hash).toEqual(block.header.hash)

    const onEvent: Mock<(header: BlockHeader, event: 'add' | 'remove') => void> = jest.fn()

    const processor = new ChainProcessor({ chain, head: chain.genesis.hash })
    processor.onAdd.on((block) => onEvent(block, 'add'))
    processor.onRemove.on((block) => onEvent(block, 'remove'))

    let result = await processor.update()
    expect(result.hashChanged).toBe(true)
    expect(processor.hash).toEqualBuffer(block.header.hash)
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenNthCalledWith(1, block.header, 'add')

    onEvent.mockReset()

    result = await processor.update()
    expect(result.hashChanged).toBe(false)
    expect(processor.hash).toEqualBuffer(block.header.hash)
    expect(onEvent).toHaveBeenCalledTimes(0)
  })

  it('should not crash if head not found', async () => {
    const MISSING_HEAD = Buffer.alloc(32, 'helloworld')
    const processor = new ChainProcessor({ chain: nodeTest.chain, head: MISSING_HEAD })

    const onEvent: Mock<(header: BlockHeader, event: 'add' | 'remove') => void> = jest.fn()
    processor.onAdd.on((block) => onEvent(block, 'add'))
    processor.onRemove.on((block) => onEvent(block, 'remove'))

    const result = await processor.update()
    expect(result.hashChanged).toBe(false)
    expect(processor.hash).toEqualBuffer(MISSING_HEAD)
    expect(onEvent).toHaveBeenCalledTimes(0)
  })
})
