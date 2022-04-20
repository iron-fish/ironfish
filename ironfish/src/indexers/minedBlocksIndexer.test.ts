/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import os from 'os'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { Assert } from '../assert'
import { NodeFileProvider } from '../fileSystems'
import { createNodeTest, useAccountFixture, useMinerBlockFixture } from '../testUtilities'
import { MinedBlocksIndexer } from './minedBlocksIndexer'

describe('MinedBlockIndexer', () => {
  const nodeTest = createNodeTest()

  it('should add block info to the store when a block is mined', async () => {
    const { node, strategy, chain } = await nodeTest.createSetup()
    strategy.disableMiningReward()
    const genesis = await chain.getBlock(chain.genesis)
    Assert.isNotNull(genesis)

    const files = new NodeFileProvider()
    await files.init()

    const indexer = new MinedBlocksIndexer({
      files,
      location: path.join(os.tmpdir(), uuid()),
      accounts: node.accounts,
      chain,
    })

    await indexer.open()
    indexer.start()

    const putSpy = jest.spyOn(indexer['minedBlocks'], 'put')

    const accountA = await useAccountFixture(node.accounts, 'a')
    const blockA1 = await useMinerBlockFixture(chain, undefined, accountA, node.accounts)
    await expect(chain).toAddBlock(blockA1)

    await indexer.updateHead()

    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(putSpy).toHaveBeenCalledWith(
      blockA1.header.hash,
      {
        main: true,
        sequence: blockA1.header.sequence,
        account: 'a',
        minersFee: 0,
      },
      expect.anything(),
    )

    await indexer.stop()
    await indexer.close()
  })

  it('should change main block to fork on chain fork', async () => {
    const { node: nodeA, strategy } = await nodeTest.createSetup()
    const { node: nodeB } = await nodeTest.createSetup()
    strategy.disableMiningReward()

    const genesis = await nodeA.chain.getBlock(nodeA.chain.genesis)
    Assert.isNotNull(genesis)

    const files = new NodeFileProvider()
    await files.init()

    const indexer = new MinedBlocksIndexer({
      files,
      location: path.join(os.tmpdir(), uuid()),
      accounts: nodeA.accounts,
      chain: nodeA.chain,
    })
    await indexer.open()
    indexer.start()

    const putSpy = jest.spyOn(indexer['minedBlocks'], 'put')

    const accountA = await useAccountFixture(nodeA.accounts, 'a')
    const accountB = await useAccountFixture(nodeA.accounts, 'b')

    const blockA1 = await useMinerBlockFixture(nodeA.chain, undefined, accountA)
    await expect(nodeA.chain).toAddBlock(blockA1)

    await indexer.updateHead()

    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(putSpy).toHaveBeenCalledWith(
      blockA1.header.hash,
      {
        main: true,
        sequence: blockA1.header.sequence,
        account: 'a',
        minersFee: 0,
      },
      expect.anything(),
    )

    const blockB1 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB2)

    await expect(nodeA.chain).toAddBlock(blockB1)
    await expect(nodeA.chain).toAddBlock(blockB2)
    await indexer.updateHead()

    expect(putSpy).toHaveBeenCalledTimes(4)
    expect(await indexer['minedBlocks'].get(blockA1.header.hash)).toEqual({
      main: false,
      sequence: blockA1.header.sequence,
      account: 'a',
      minersFee: 0,
    })

    await indexer.stop()
    await indexer.close()
  })

  describe('getMinedBlocks', () => {
    it('returns non-fork mined blocks by default in sorted order', async () => {
      const { node, strategy } = await nodeTest.createSetup()
      strategy.disableMiningReward()
      const genesis = await node.chain.getBlock(node.chain.genesis)
      Assert.isNotNull(genesis)

      const files = new NodeFileProvider()
      await files.init()

      const indexer = new MinedBlocksIndexer({
        files,
        location: path.join(os.tmpdir(), uuid()),
        accounts: node.accounts,
        chain: node.chain,
      })

      await indexer.open()
      indexer.start()

      const accountA = await useAccountFixture(node.accounts, 'a')
      const blockA1 = await useMinerBlockFixture(node.chain, 2, accountA)
      await expect(node.chain).toAddBlock(blockA1)
      const blockA2 = await useMinerBlockFixture(node.chain, 3, accountA)
      await expect(node.chain).toAddBlock(blockA2)
      const blockA3 = await useMinerBlockFixture(node.chain, 4, accountA)
      await expect(node.chain).toAddBlock(blockA3)

      await indexer.updateHead()

      const minedBlocks = []

      for await (const block of indexer.getMinedBlocks({})) {
        minedBlocks.push(block)
      }

      expect(minedBlocks.length).toEqual(3)
      expect(minedBlocks[0].sequence).toBeLessThan(minedBlocks[1].sequence)
      expect(minedBlocks[0]).toEqual({
        main: true,
        sequence: expect.any(Number),
        account: 'a',
        minersFee: expect.any(Number),
        hash: expect.any(Buffer),
      })

      await indexer.stop()
      await indexer.close()
    })

    it('returns all mined blocks with scanForks flag included', async () => {
      const { node: nodeA, strategy } = await nodeTest.createSetup()
      const { node: nodeB } = await nodeTest.createSetup()
      strategy.disableMiningReward()

      const genesis = await nodeA.chain.getBlock(nodeA.chain.genesis)
      Assert.isNotNull(genesis)

      const files = new NodeFileProvider()
      await files.init()

      const indexer = new MinedBlocksIndexer({
        files,
        location: path.join(os.tmpdir(), uuid()),
        accounts: nodeA.accounts,
        chain: nodeA.chain,
      })
      await indexer.open()
      indexer.start()

      const accountA = await useAccountFixture(nodeA.accounts, 'a')
      const accountB = await useAccountFixture(nodeA.accounts, 'b')

      const blockA1 = await useMinerBlockFixture(nodeA.chain, undefined, accountA)
      await expect(nodeA.chain).toAddBlock(blockA1)

      await indexer.updateHead()

      const blockB1 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
      await expect(nodeB.chain).toAddBlock(blockB1)
      const blockB2 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
      await expect(nodeB.chain).toAddBlock(blockB2)

      await expect(nodeA.chain).toAddBlock(blockB1)
      await expect(nodeA.chain).toAddBlock(blockB2)
      await indexer.updateHead()

      const minedBlocks = []

      for await (const block of indexer.getMinedBlocks({ scanForks: true })) {
        minedBlocks.push(block)
      }

      expect(minedBlocks.length).toEqual(3)
      expect(minedBlocks[0].main).toBeFalsy()

      await indexer.stop()
      await indexer.close()
    })
  })

  it('removeMinedBlocks removes mined block info for a given account', async () => {
    const { node, strategy } = await nodeTest.createSetup()
    strategy.disableMiningReward()

    const genesis = await node.chain.getBlock(node.chain.genesis)
    Assert.isNotNull(genesis)

    const files = new NodeFileProvider()
    await files.init()

    const indexer = new MinedBlocksIndexer({
      files,
      location: path.join(os.tmpdir(), uuid()),
      accounts: node.accounts,
      chain: node.chain,
    })
    await indexer.open()
    indexer.start()

    const accountA = await useAccountFixture(node.accounts, 'a')
    const accountB = await useAccountFixture(node.accounts, 'b')

    const blockA1 = await useMinerBlockFixture(node.chain, 2, accountA)
    await expect(node.chain).toAddBlock(blockA1)
    const blockB1 = await useMinerBlockFixture(node.chain, 3, accountB)
    await expect(node.chain).toAddBlock(blockB1)
    await indexer.updateHead()

    await indexer.removeMinedBlocks(accountB.name)

    const minedBlocks = []

    for await (const block of indexer.getMinedBlocks({})) {
      minedBlocks.push(block)
    }
    expect(minedBlocks.length).toEqual(1)
    expect(minedBlocks[0].account).toEqual(accountA.name)

    await indexer.stop()
    await indexer.close()
  })
})
