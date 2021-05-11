/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../assert'
import { AsyncUtils } from '../utils'
import { createNodeTest, useAccountFixture, useMinerBlockFixture } from '../testUtilities'
import { makeBlockAfter } from '../testUtilities/helpers/blockchain'

describe('Blockchain', () => {
  const nodeTest = createNodeTest()

  it('constructs an empty chain', async () => {
    const { chain } = nodeTest
    await chain.open()

    expect(await chain.notes.size()).toBe(0)
    expect(await chain.nullifiers.size()).toBe(0)
    expect(chain.isEmpty).toBe(true)
    expect(chain.head).toBe(null)
    expect(chain.latest).toBe(null)
    expect(chain.synced).toBe(false)
  })

  it('add genesis block', async () => {
    const { node, chain } = nodeTest
    await chain.open()

    expect(chain.head).toBe(null)
    expect(chain.hasGenesisBlock).toBe(false)
    expect(chain.isEmpty).toBe(true)

    const genesis = await node.seed()

    expect(chain.head?.hash).toEqualHash(genesis.header.hash)
    expect(chain.latest?.hash).toEqualHash(genesis.header.hash)
    expect(chain.isEmpty).toBe(false)
    expect(chain.hasGenesisBlock).toBe(true)
    expect(await chain.notes.size()).toBeGreaterThan(0)
    expect(await chain.nullifiers.size()).toBeGreaterThan(0)
    expect(await chain.getPrevious(genesis.header)).toBe(null)
    expect(await chain.getNext(genesis.header)).toBe(null)
  }, 10000)

  it('add blocks with forks', async () => {
    const { strategy, chain } = nodeTest
    strategy.disableMiningReward()

    const genesis = await nodeTest.node.seed()
    Assert.isNotNull(genesis)

    // G -> A1 -> A2
    //         -> B2 -> B3

    const blockA1 = await makeBlockAfter(chain, genesis)
    const blockA2 = await makeBlockAfter(chain, blockA1)
    const blockB2 = await makeBlockAfter(chain, blockA1)
    const blockB3 = await makeBlockAfter(chain, blockB2)

    // Added in a specific order for the test below
    // so that Genesis, A1, A2, have the same graph,
    // and B2 merges into graph [A1-A2], and [A1-A2] merge
    // into genesis block graph so [B2-B3] -> [A2,A2,Genesis]
    await expect(chain).toAddBlock(blockA1)
    await expect(chain).toAddBlock(blockA2)
    await expect(chain).toAddBlock(blockB2)
    await expect(chain).toAddBlock(blockB3)

    const headerGenesis = await chain.getHeader(genesis.header.hash)
    const headerA1 = await chain.getHeader(blockA1.header.hash)
    const headerA2 = await chain.getHeader(blockA2.header.hash)
    const headerB2 = await chain.getHeader(blockB2.header.hash)
    const headerB3 = await chain.getHeader(blockB3.header.hash)

    Assert.isNotNull(headerGenesis)
    Assert.isNotNull(headerA1)
    Assert.isNotNull(headerA2)
    Assert.isNotNull(headerB2)
    Assert.isNotNull(headerB3)

    expect(chain.genesis?.hash?.equals(genesis.header.hash)).toBe(true)
    expect(chain.head?.hash?.equals(headerB3.hash)).toBe(true)
    expect(chain.latest?.hash?.equals(headerB3.hash)).toBe(true)

    // getNext
    expect((await chain.getNext(genesis.header))?.hash?.equals(headerA1.hash)).toBe(true)
    expect((await chain.getNext(headerA1))?.hash?.equals(headerB2.hash)).toBe(true)
    expect(await chain.getNext(headerA2)).toBe(null)
    expect((await chain.getNext(headerB2))?.hash?.equals(headerB3.hash)).toBe(true)
    expect(await chain.getNext(headerB3)).toBe(null)

    // getPrevious
    expect(await chain.getPrevious(genesis.header)).toBe(null)
    expect((await chain.getPrevious(headerA1))?.hash?.equals(genesis.header.hash)).toBe(true)
    expect((await chain.getPrevious(headerB2))?.hash?.equals(headerA1.hash)).toBe(true)
    expect((await chain.getPrevious(headerB3))?.hash?.equals(headerB2.hash)).toBe(true)

    // getAtSequence
    expect((await chain.getHashAtSequence(BigInt(1)))?.equals(genesis.header.hash)).toBe(true)
    expect((await chain.getHashAtSequence(BigInt(2)))?.equals(headerA1.hash)).toBe(true)
    expect((await chain.getHashAtSequence(BigInt(3)))?.equals(headerB2.hash)).toBe(true)
    expect((await chain.getHashAtSequence(BigInt(4)))?.equals(headerB3.hash)).toBe(true)
  }, 10000)

  it('iterate', async () => {
    const { strategy, chain } = nodeTest
    strategy.disableMiningReward()

    await nodeTest.node.seed()
    const genesis = chain.genesis
    Assert.isNotNull(genesis)
    Assert.isNotNull(chain.head)
    Assert.isNotNull(chain.latest)

    // G -> A1 -> A2
    //         -> B2 -> B3
    //               -> C3 -> C4

    const blockA1 = await makeBlockAfter(chain, genesis)
    const blockA2 = await makeBlockAfter(chain, blockA1)
    const blockB2 = await makeBlockAfter(chain, blockA1)
    const blockB3 = await makeBlockAfter(chain, blockB2)
    const blockC3 = await makeBlockAfter(chain, blockB2)
    const blockC4 = await makeBlockAfter(chain, blockC3)

    await expect(chain).toAddBlock(blockA1)
    await expect(chain).toAddBlock(blockB2)
    await expect(chain).toAddBlock(blockB3)
    await expect(chain).toAddBlock(blockA2)
    await expect(chain).toAddBlock(blockC3)
    await expect(chain).toAddBlock(blockC4)

    expect(chain.head.hash.equals(blockC4.header.hash)).toBe(true)
    expect(chain.latest.hash.equals(blockC4.header.hash)).toBe(true)

    // should be able to start at the tail
    let blocks = await AsyncUtils.materialize(chain.iterateTo(genesis, blockC4.header))
    expect(blocks.length).toBe(5)
    expect(blocks[0].hash.equals(genesis.hash)).toBe(true)
    expect(blocks[1].hash.equals(blockA1.header.hash)).toBe(true)
    expect(blocks[2].hash.equals(blockB2.header.hash)).toBe(true)
    expect(blocks[3].hash.equals(blockC3.header.hash)).toBe(true)
    expect(blocks[4].hash.equals(blockC4.header.hash)).toBe(true)

    // should be able to start at the head
    blocks = await AsyncUtils.materialize(chain.iterateFrom(blockC4.header, genesis))
    expect(blocks.length).toBe(5)
    expect(blocks[0].hash.equals(blockC4.header.hash)).toBe(true)
    expect(blocks[1].hash.equals(blockC3.header.hash)).toBe(true)
    expect(blocks[2].hash.equals(blockB2.header.hash)).toBe(true)
    expect(blocks[3].hash.equals(blockA1.header.hash)).toBe(true)
    expect(blocks[4].hash.equals(genesis.hash)).toBe(true)

    // should be able to start after the tail
    blocks = await AsyncUtils.materialize(chain.iterateTo(blockA1.header, blockC3.header))
    expect(blocks.length).toBe(3)
    expect(blocks[0].hash.equals(blockA1.header.hash)).toBe(true)
    expect(blocks[1].hash.equals(blockB2.header.hash)).toBe(true)
    expect(blocks[2].hash.equals(blockC3.header.hash)).toBe(true)

    // should be able to start before the head
    blocks = await AsyncUtils.materialize(chain.iterateFrom(blockB2.header, blockA1.header))
    expect(blocks.length).toBe(2)
    expect(blocks[0].hash.equals(blockB2.header.hash)).toBe(true)
    expect(blocks[1].hash.equals(blockA1.header.hash)).toBe(true)

    // If we iterate the same block, it should be yielded once
    blocks = await AsyncUtils.materialize(chain.iterateTo(genesis, genesis))
    expect(blocks.length).toBe(1)
    expect(blocks[0].hash.equals(genesis.hash)).toBe(true)

    // If we iterate the same block, it should be yielded once
    blocks = await AsyncUtils.materialize(chain.iterateFrom(genesis, genesis))
    expect(blocks.length).toBe(1)
    expect(blocks[0].hash.equals(genesis.hash)).toBe(true)
  })

  it('iterate errors', async () => {
    const { strategy, chain } = nodeTest
    strategy.disableMiningReward()

    await nodeTest.node.seed()
    const genesis = chain.genesis
    Assert.isNotNull(genesis)

    // G -> A1 -> A2
    //   -> B1 -> B2

    const blockA1 = await makeBlockAfter(chain, genesis)
    const blockA2 = await makeBlockAfter(chain, blockA1)
    const blockB1 = await makeBlockAfter(chain, genesis)
    const blockB2 = await makeBlockAfter(chain, blockB1)

    await expect(chain).toAddBlock(blockA1)
    await expect(chain).toAddBlock(blockA2)
    await expect(chain).toAddBlock(blockB1)
    await expect(chain).toAddBlock(blockB2)

    // Cannot iterate between 2 forks when graph path happen to make it seem like
    // it can work, a few wrong blocks are yielded in this case

    // left-to-right
    let result = AsyncUtils.materialize(chain.iterateTo(blockA1.header, blockB2.header))
    await expect(result).rejects.toThrowError(
      'Failed to iterate between blocks on diverging forks',
    )
    result = AsyncUtils.materialize(chain.iterateFrom(blockA1.header, blockB2.header))
    await expect(result).rejects.toThrowError(
      'Failed to iterate between blocks on diverging forks',
    )

    // right-to-left
    result = AsyncUtils.materialize(chain.iterateTo(blockB2.header, blockA1.header))
    await expect(result).rejects.toThrowError(
      'Failed to iterate between blocks on diverging forks',
    )
    result = AsyncUtils.materialize(chain.iterateFrom(blockB2.header, blockA1.header))
    await expect(result).rejects.toThrowError(
      'Failed to iterate between blocks on diverging forks',
    )
  })

  it('findFork', async () => {
    const { strategy, chain } = nodeTest
    strategy.disableMiningReward()

    await nodeTest.node.seed()
    const genesis = chain.genesis
    Assert.isNotNull(genesis)

    // G -> A1 -> A2
    //         -> B2 -> B3
    //               -> C3 -> C4
    //                     -> D4

    const blockA1 = await makeBlockAfter(chain, genesis)
    const blockA2 = await makeBlockAfter(chain, blockA1)
    const blockB2 = await makeBlockAfter(chain, blockA1)
    const blockB3 = await makeBlockAfter(chain, blockB2)
    const blockC3 = await makeBlockAfter(chain, blockB2)
    const blockC4 = await makeBlockAfter(chain, blockC3)
    const blockD4 = await makeBlockAfter(chain, blockC3)

    await expect(chain).toAddBlock(blockA1)
    await expect(chain).toAddBlock(blockA2)
    await expect(chain).toAddBlock(blockB2)
    await expect(chain).toAddBlock(blockB3)
    await expect(chain).toAddBlock(blockC3)
    await expect(chain).toAddBlock(blockC4)
    await expect(chain).toAddBlock(blockD4)

    const { fork: fork1, isLinear: isLinear1 } = await chain.findFork(blockA1, blockA1)
    expect(fork1?.hash.equals(blockA1.header.hash)).toBe(true)
    expect(isLinear1).toBe(true)

    const { fork: fork2, isLinear: isLinear2 } = await chain.findFork(blockA1, blockA2)
    expect(fork2?.hash.equals(blockA1.header.hash)).toBe(true)
    expect(isLinear2).toBe(true)

    const { fork: fork3, isLinear: isLinear3 } = await chain.findFork(blockA2, blockB2)
    expect(fork3?.hash.equals(blockA1.header.hash)).toBe(true)
    expect(isLinear3).toBe(false)

    const { fork: fork4, isLinear: isLinear4 } = await chain.findFork(genesis, blockD4)
    expect(fork4?.hash.equals(genesis.hash)).toBe(true)
    expect(isLinear4).toBe(true)

    const { fork: fork5, isLinear: isLinear5 } = await chain.findFork(blockB3, blockD4)
    expect(fork5?.hash.equals(blockB2.header.hash)).toBe(true)
    expect(isLinear5).toBe(false)

    const { fork: fork6, isLinear: isLinear6 } = await chain.findFork(blockC4, blockD4)
    expect(fork6?.hash.equals(blockC3.header.hash)).toBe(true)
    expect(isLinear6).toBe(false)
  })

  it('should notes to trees', async () => {
    /**
     * This test will check that notes are added linearly, and also the trees
     * are reorganized for a heavier fork when a heavier fork appears
     *
     * G -> A1
     *   -> B1 -> B2
     */
    const { node: nodeA } = nodeTest
    const { node: nodeB } = await nodeTest.createSetup()
    await Promise.all([nodeA.seed(), nodeB.seed()])

    const notes = await nodeA.chain.notes.size()
    const nullifiers = await nodeB.chain.nullifiers.size()

    const accountA = await useAccountFixture(nodeA.accounts, 'accountA')
    const accountB = await useAccountFixture(nodeB.accounts, 'accountB')

    const blockA1 = await useMinerBlockFixture(nodeA.chain, 2, accountA)
    const blockB1 = await useMinerBlockFixture(nodeB.chain, 2, accountB)

    await nodeA.chain.addBlock(blockA1)
    await nodeB.chain.addBlock(blockB1)

    const blockB2 = await useMinerBlockFixture(nodeB.chain, 3, accountB)

    expect(blockA1.transactions.length).toBe(1)
    expect(blockB1.transactions.length).toBe(1)
    expect(blockB2.transactions.length).toBe(1)
    const minersFeeA1 = blockA1.transactions[0]
    const minersFeeB1 = blockB1.transactions[0]
    const minersFeeB2 = blockB2.transactions[0]
    expect(minersFeeA1.notesLength()).toBe(1)
    expect(minersFeeB1.notesLength()).toBe(1)
    expect(minersFeeB2.notesLength()).toBe(1)

    // Check nodeA's chain has notes from blockA1
    expect(await nodeA.chain.notes.size()).toBe(notes + 1)
    expect(await nodeA.chain.nullifiers.size()).toBe(nullifiers)
    const addedNoteA1 = (await nodeA.chain.notes.getLeaf(notes)).element
    expect(minersFeeA1.getNote(0).serialize().equals(addedNoteA1.serialize())).toBe(true)

    // Check nodeB's chain has notes from blockB1
    expect(await nodeB.chain.notes.size()).toBe(notes + 1)
    expect(await nodeB.chain.nullifiers.size()).toBe(nullifiers)
    let addedNoteB1 = (await nodeB.chain.notes.getLeaf(notes)).element
    expect(minersFeeB1.getNote(0).serialize().equals(addedNoteB1.serialize())).toBe(true)

    // Now add blockB2 to nodeB
    await nodeB.chain.addBlock(blockB2)

    // Check nodeB's chain has notes from blockB2
    expect(await nodeB.chain.notes.size()).toBe(notes + 2)
    expect(await nodeB.chain.nullifiers.size()).toBe(nullifiers)
    let addedNoteB2 = (await nodeB.chain.notes.getLeaf(notes + 1)).element
    expect(minersFeeB2.getNote(0).serialize().equals(addedNoteB2.serialize())).toBe(true)

    // Now cause reorg on nodeA
    await nodeA.chain.addBlock(blockB1)
    await nodeA.chain.addBlock(blockB2)

    // Check nodeA's chain has removed blockA1 notes and added blockB1 + blockB2 note
    expect(await nodeA.chain.notes.size()).toBe(notes + 2)
    expect(await nodeA.chain.nullifiers.size()).toBe(nullifiers)
    addedNoteB1 = (await nodeA.chain.notes.getLeaf(notes)).element
    addedNoteB2 = (await nodeA.chain.notes.getLeaf(notes + 1)).element
    expect(minersFeeB1.getNote(0).serialize().equals(addedNoteB1.serialize())).toBe(true)
    expect(minersFeeB2.getNote(0).serialize().equals(addedNoteB2.serialize())).toBe(true)
  }, 20000)

  it('should update synced', async () => {
    const nowSpy = jest.spyOn(Date, 'now')
    const syncedSpy = jest.spyOn(nodeTest.node.chain.onSynced, 'emit')

    // Empty chain should not be synced
    expect(nodeTest.node.chain.synced).toEqual(false)
    expect(syncedSpy).not.toHaveBeenCalled()

    // Genesis block is a too far back to be synced
    nowSpy.mockReturnValue(Number.MAX_SAFE_INTEGER)
    const genesis = await nodeTest.node.seed()
    expect(nodeTest.node.chain.head).toEqual(genesis.header)
    expect(nodeTest.node.chain.synced).toEqual(false)
    expect(syncedSpy).not.toHaveBeenCalled()

    // Set now to genesis block creation time to consider it synced
    nowSpy.mockReturnValue(genesis.header.timestamp.valueOf())
    nodeTest.node.chain['updateSynced']()
    expect(nodeTest.node.chain.synced).toEqual(true)
    expect(syncedSpy).toHaveBeenCalledTimes(1)

    // Once it's true, it stays true
    nowSpy.mockReturnValue(Number.MAX_SAFE_INTEGER)
    nodeTest.node.chain['updateSynced']()
    expect(nodeTest.node.chain.synced).toEqual(true)
    expect(syncedSpy).toHaveBeenCalledTimes(1)
  })
})
