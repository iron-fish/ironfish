/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import os from 'os'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { NodeFileProvider } from '../fileSystems'
import { createNodeTest, useAccountFixture, useMinerBlockFixture } from '../testUtilities'
import { MinedBlocksIndexer } from './minedBlocksIndexer'

describe('MinedBlockIndexer', () => {
  const nodeTest = createNodeTest()

  it('should add block info to the store when a block is mined', async () => {
    const { node: nodeA, strategy } = await nodeTest.createSetup()
    strategy.disableMiningReward()

    const indexer = new MinedBlocksIndexer({
      files: new NodeFileProvider(),
      location: path.join(os.tmpdir(), uuid()),
      accounts: nodeA.accounts,
      chain: nodeA.chain,
      chainProcessor: nodeA.accounts['chainProcessor'],
    })
    await indexer.database.open()

    const putSpy = jest.spyOn(indexer, 'put')

    const accountA = await useAccountFixture(nodeA.accounts, 'a')
    const blockA1 = await useMinerBlockFixture(nodeA.chain, undefined, accountA, nodeA.accounts)
    await expect(nodeA.chain).toAddBlock(blockA1)
    await nodeA.accounts.updateHead()

    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(putSpy).toHaveBeenCalledWith(blockA1.header, 'a', true, 0)
    expect(await indexer.getBlock(blockA1.header.hash.toString('hex'))).toEqual({
      main: true,
      hash: blockA1.header.hash.toString('hex'),
      sequence: blockA1.header.sequence,
      account: 'a',
      minersFee: 0,
    })
  })

  it('should change main block to fork on chain fork', async () => {
    const { node: nodeA, strategy } = await nodeTest.createSetup()
    const { node: nodeB } = await nodeTest.createSetup()
    strategy.disableMiningReward()

    const indexer = new MinedBlocksIndexer({
      files: new NodeFileProvider(),
      location: path.join(os.tmpdir(), uuid()),
      accounts: nodeA.accounts,
      chain: nodeA.chain,
      chainProcessor: nodeA.accounts['chainProcessor'],
    })
    await indexer.database.open()

    const putSpy = jest.spyOn(indexer, 'put')

    const accountA = await useAccountFixture(nodeA.accounts, 'a')
    const accountB = await useAccountFixture(nodeA.accounts, 'b')

    const blockA1 = await useMinerBlockFixture(nodeA.chain, undefined, accountA, nodeA.accounts)
    await expect(nodeA.chain).toAddBlock(blockA1)

    await nodeA.accounts.updateHead()
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(putSpy).toHaveBeenCalledWith(blockA1.header, 'a', true, 0)
    expect(await indexer.getBlock(blockA1.header.hash.toString('hex'))).toEqual({
      main: true,
      hash: blockA1.header.hash.toString('hex'),
      sequence: blockA1.header.sequence,
      account: 'a',
      minersFee: 0,
    })

    const blockB1 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
    await expect(nodeB.chain).toAddBlock(blockB2)

    await expect(nodeA.chain).toAddBlock(blockB1)
    await expect(nodeA.chain).toAddBlock(blockB2)
    await nodeA.accounts.updateHead()

    expect(putSpy).toHaveBeenCalledTimes(4)
    expect(putSpy).toHaveBeenCalledWith(blockA1.header, 'a', false, 0)
    expect(await indexer.getBlock(blockA1.header.hash.toString('hex'))).toEqual({
      main: false,
      hash: blockA1.header.hash.toString('hex'),
      sequence: blockA1.header.sequence,
      account: 'a',
      minersFee: 0,
    })
  })
})
