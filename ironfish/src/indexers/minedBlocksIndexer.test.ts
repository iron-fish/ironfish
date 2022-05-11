/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { createNodeTest, useAccountFixture, useMinerBlockFixture } from '../testUtilities'

describe('MinedBlockIndexer', () => {
  const nodeTest = createNodeTest()

  it('should add block info to the store when a block is mined', async () => {
    const { node, strategy, chain } = await nodeTest.createSetup()
    strategy.disableMiningReward()
    const genesis = await chain.getBlock(chain.genesis)
    Assert.isNotNull(genesis)

    await node.minedBlocksIndexer.open()
    node.minedBlocksIndexer.start()

    const putSpy = jest.spyOn(node.minedBlocksIndexer['minedBlocks'], 'put')

    const accountA = await useAccountFixture(node.accounts, 'a')
    const blockA1 = await useMinerBlockFixture(chain, undefined, accountA, node.accounts)
    await expect(chain).toAddBlock(blockA1)

    await node.minedBlocksIndexer.updateHead()

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

    await node.minedBlocksIndexer.stop()
    await node.minedBlocksIndexer.close()
  })

  it('should change main block to fork on chain fork', async () => {
    const { node: nodeA, strategy } = await nodeTest.createSetup()
    const { node: nodeB } = await nodeTest.createSetup()
    strategy.disableMiningReward()

    const genesis = await nodeA.chain.getBlock(nodeA.chain.genesis)
    Assert.isNotNull(genesis)

    await nodeA.minedBlocksIndexer.open()
    nodeA.minedBlocksIndexer.start()

    const putSpy = jest.spyOn(nodeA.minedBlocksIndexer['minedBlocks'], 'put')

    const accountA = await useAccountFixture(nodeA.accounts, 'a')
    const accountB = await useAccountFixture(nodeA.accounts, 'b')

    const blockA1 = await useMinerBlockFixture(nodeA.chain, undefined, accountA)
    await expect(nodeA.chain).toAddBlock(blockA1)

    await nodeA.minedBlocksIndexer.updateHead()

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
    await nodeA.minedBlocksIndexer.updateHead()

    expect(putSpy).toHaveBeenCalledTimes(4)
    expect(await nodeA.minedBlocksIndexer['minedBlocks'].get(blockA1.header.hash)).toEqual({
      main: false,
      sequence: blockA1.header.sequence,
      account: 'a',
      minersFee: 0,
    })

    await nodeA.minedBlocksIndexer.stop()
    await nodeA.minedBlocksIndexer.close()
  })

  it('getMinedBlock returns mined block given a hash', async () => {
    const { node, strategy } = await nodeTest.createSetup()
    strategy.disableMiningReward()

    const genesis = await node.chain.getBlock(node.chain.genesis)
    Assert.isNotNull(genesis)

    await node.minedBlocksIndexer.open()
    node.minedBlocksIndexer.start()

    const accountA = await useAccountFixture(node.accounts, 'a')
    const blockA1 = await useMinerBlockFixture(node.chain, undefined, accountA)
    await expect(node.chain).toAddBlock(blockA1)

    await node.minedBlocksIndexer.updateHead()

    expect(await node.minedBlocksIndexer.getMinedBlock(blockA1.header.hash)).toEqual({
      main: true,
      sequence: 2,
      account: accountA.name,
      minersFee: 0,
      hash: blockA1.header.hash.toString('hex'),
    })

    await node.minedBlocksIndexer.stop()
    await node.minedBlocksIndexer.close()
  })

  describe('getMinedBlocks', () => {
    it('returns non-fork mined blocks by default in sorted order', async () => {
      const { node, strategy } = await nodeTest.createSetup()
      strategy.disableMiningReward()
      const genesis = await node.chain.getBlock(node.chain.genesis)
      Assert.isNotNull(genesis)

      await node.minedBlocksIndexer.open()
      node.minedBlocksIndexer.start()

      const accountA = await useAccountFixture(node.accounts, 'a')
      const blockA1 = await useMinerBlockFixture(node.chain, 2, accountA)
      await expect(node.chain).toAddBlock(blockA1)
      const blockA2 = await useMinerBlockFixture(node.chain, 3, accountA)
      await expect(node.chain).toAddBlock(blockA2)
      const blockA3 = await useMinerBlockFixture(node.chain, 4, accountA)
      await expect(node.chain).toAddBlock(blockA3)

      await node.minedBlocksIndexer.updateHead()

      const minedBlocks = []

      for await (const block of node.minedBlocksIndexer.getMinedBlocks({})) {
        minedBlocks.push(block)
      }

      expect(minedBlocks.length).toEqual(3)
      expect(minedBlocks[0].sequence).toBeLessThan(minedBlocks[1].sequence)
      expect(minedBlocks[0]).toEqual({
        main: true,
        sequence: expect.any(Number),
        account: 'a',
        minersFee: expect.any(Number),
        hash: expect.any(String),
      })

      await node.minedBlocksIndexer.stop()
      await node.minedBlocksIndexer.close()
    })

    it('returns all mined blocks with scanForks flag included', async () => {
      const { node: nodeA, strategy } = await nodeTest.createSetup()
      const { node: nodeB } = await nodeTest.createSetup()
      strategy.disableMiningReward()

      const genesis = await nodeA.chain.getBlock(nodeA.chain.genesis)
      Assert.isNotNull(genesis)

      await nodeA.minedBlocksIndexer.open()
      nodeA.minedBlocksIndexer.start()

      const accountA = await useAccountFixture(nodeA.accounts, 'a')
      const accountB = await useAccountFixture(nodeA.accounts, 'b')

      const blockA1 = await useMinerBlockFixture(nodeA.chain, undefined, accountA)
      await expect(nodeA.chain).toAddBlock(blockA1)

      await nodeA.minedBlocksIndexer.updateHead()

      const blockB1 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
      await expect(nodeB.chain).toAddBlock(blockB1)
      const blockB2 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
      await expect(nodeB.chain).toAddBlock(blockB2)

      await expect(nodeA.chain).toAddBlock(blockB1)
      await expect(nodeA.chain).toAddBlock(blockB2)
      await nodeA.minedBlocksIndexer.updateHead()

      const minedBlocks = []

      for await (const block of nodeA.minedBlocksIndexer.getMinedBlocks({ scanForks: true })) {
        minedBlocks.push(block)
      }

      expect(minedBlocks.length).toEqual(3)
      expect(minedBlocks[0].main).toBeFalsy()

      await nodeA.minedBlocksIndexer.stop()
      await nodeA.minedBlocksIndexer.close()
    })
  })

  describe('removeMinedBlocks', () => {
    it('removes mined block info for a given account', async () => {
      const { node, strategy } = await nodeTest.createSetup()
      strategy.disableMiningReward()

      const genesis = await node.chain.getBlock(node.chain.genesis)
      Assert.isNotNull(genesis)

      await node.minedBlocksIndexer.open()
      node.minedBlocksIndexer.start()

      const accountA = await useAccountFixture(node.accounts, 'a')
      const accountB = await useAccountFixture(node.accounts, 'b')

      const blockA1 = await useMinerBlockFixture(node.chain, 2, accountA)
      await expect(node.chain).toAddBlock(blockA1)
      const blockB1 = await useMinerBlockFixture(node.chain, 3, accountB)
      await expect(node.chain).toAddBlock(blockB1)
      await node.minedBlocksIndexer.updateHead()

      await node.minedBlocksIndexer.removeMinedBlocks(accountB.name)

      const minedBlocks = []

      for await (const block of node.minedBlocksIndexer.getMinedBlocks({})) {
        minedBlocks.push(block)
      }
      expect(minedBlocks.length).toEqual(1)
      expect(minedBlocks[0].account).toEqual(accountA.name)

      await node.minedBlocksIndexer.stop()
      await node.minedBlocksIndexer.close()
    })

    it('does not remove mined blocks not associated to given account', async () => {
      const { node: nodeA, strategy } = await nodeTest.createSetup()
      const { node: nodeB } = await nodeTest.createSetup()
      strategy.disableMiningReward()

      const genesis = await nodeA.chain.getBlock(nodeA.chain.genesis)
      Assert.isNotNull(genesis)

      await nodeA.minedBlocksIndexer.open()
      nodeA.minedBlocksIndexer.start()

      const accountA = await useAccountFixture(nodeA.accounts, 'a')
      const accountB = await useAccountFixture(nodeB.accounts, 'b')
      await nodeA.accounts.importAccount(accountB)

      const blockA1 = await useMinerBlockFixture(nodeA.chain, 2, accountA)
      await expect(nodeA.chain).toAddBlock(blockA1)
      const blockB1 = await useMinerBlockFixture(nodeA.chain, 3, accountB)
      await expect(nodeA.chain).toAddBlock(blockB1)
      await nodeA.minedBlocksIndexer.updateHead()

      await nodeA.minedBlocksIndexer.removeMinedBlocks('b')
      expect(await nodeA.minedBlocksIndexer['sequenceToHashes'].get(2)).not.toBeUndefined()
      expect(await nodeA.minedBlocksIndexer['sequenceToHashes'].get(2)).toEqual({
        hashes: [blockA1.header.hash],
      })

      await nodeA.minedBlocksIndexer.stop()
      await nodeA.minedBlocksIndexer.close()
    })
  })
})
