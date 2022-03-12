/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../assert'
import { VerificationResultReason } from '../consensus'
import {
  createNodeTest,
  useAccountFixture,
  useBlockWithTx,
  useMinerBlockFixture,
  useMinersTxFixture,
  useTxSpendsFixture,
} from '../testUtilities'
import { makeBlockAfter } from '../testUtilities/helpers/blockchain'
import { AsyncUtils } from '../utils'

describe('Blockchain', () => {
  const nodeTest = createNodeTest()

  it('add genesis block', async () => {
    const { chain } = nodeTest
    await chain.open()

    const genesis = await chain.getBlock(chain.genesis)
    Assert.isNotNull(genesis)

    expect(chain.head.hash).toEqualHash(genesis.header.hash)
    expect(chain.latest.hash).toEqualHash(genesis.header.hash)
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

    // G -> A1 -> A2
    //         -> B2 -> B3

    const genesis = await chain.getBlock(chain.genesis)
    Assert.isNotNull(genesis)

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

    expect(chain.genesis.hash.equals(genesis.header.hash)).toBe(true)
    expect(chain.head.hash.equals(headerB3.hash)).toBe(true)
    expect(chain.latest.hash.equals(headerB3.hash)).toBe(true)

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
    expect((await chain.getHashAtSequence(1))?.equals(genesis.header.hash)).toBe(true)
    expect((await chain.getHashAtSequence(2))?.equals(headerA1.hash)).toBe(true)
    expect((await chain.getHashAtSequence(3))?.equals(headerB2.hash)).toBe(true)
    expect((await chain.getHashAtSequence(4))?.equals(headerB3.hash)).toBe(true)
  }, 10000)

  it('iterate', async () => {
    const { strategy, chain } = nodeTest
    strategy.disableMiningReward()

    const genesis = chain.genesis

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

  it('should not iterate and jump chains and throw error', async () => {
    const { strategy, chain } = nodeTest
    strategy.disableMiningReward()

    const genesis = chain.genesis

    // This test checks that when iterating a reorg is happening, we don't
    // suddenly jump chains while the table is being re-written when we don't
    // have a lock on the main chain table. We try to iterate to A2, then do a
    // reorg and see if the next iteration incorrectly yields B3.
    //
    // G -> A1 -> A2 -> A3 -> A4
    //         -> B2 -> B3 -> B4 -> B5

    const blockA1 = await makeBlockAfter(chain, genesis)
    const blockA2 = await makeBlockAfter(chain, blockA1)
    const blockA3 = await makeBlockAfter(chain, blockA2)
    const blockA4 = await makeBlockAfter(chain, blockA3)

    const blockB2 = await makeBlockAfter(chain, blockA1)
    const blockB3 = await makeBlockAfter(chain, blockB2)
    const blockB4 = await makeBlockAfter(chain, blockB3)
    const blockB5 = await makeBlockAfter(chain, blockB4)

    await expect(chain).toAddBlock(blockA1)
    await expect(chain).toAddBlock(blockA2)
    await expect(chain).toAddBlock(blockA3)
    await expect(chain).toAddBlock(blockA4)

    expect(chain.head.hash.equals(blockA4.header.hash)).toBe(true)
    expect(chain.latest.hash.equals(blockA4.header.hash)).toBe(true)

    const iter1 = chain.iterateTo(genesis, blockA4.header, undefined, true)

    const block1 = await iter1.next()
    const block2 = await iter1.next()
    const block3 = await iter1.next()

    expect(block1).toMatchObject({ done: false, value: { hash: genesis.hash } })
    expect(block2).toMatchObject({ done: false, value: { hash: blockA1.header.hash } })
    expect(block3).toMatchObject({ done: false, value: { hash: blockA2.header.hash } })

    await expect(chain).toAddBlock(blockB2)
    await expect(chain).toAddBlock(blockB3)
    await expect(chain).toAddBlock(blockB4)
    await expect(chain).toAddBlock(blockB5)

    expect(chain.head.hash.equals(blockB5.header.hash)).toBe(true)
    expect(chain.latest.hash.equals(blockB5.header.hash)).toBe(true)

    await expect(iter1.next()).rejects.toThrowError('progress: 3/5')
  })

  it('should not iterate and jump chains and not throw error', async () => {
    const { strategy, chain } = nodeTest
    strategy.disableMiningReward()

    const genesis = chain.genesis

    // This test checks that when iterating a reorg is happening, we don't
    // suddenly jump chains while the table is being re-written when we don't
    // have a lock on the main chain table. We try to iterate to A2, then do a
    // reorg and see if the next iteration incorrectly yields B3.
    //
    // G -> A1 -> A2 -> A3 -> A4
    //         -> B2 -> B3 -> B4 -> B5

    const blockA1 = await makeBlockAfter(chain, genesis)
    const blockA2 = await makeBlockAfter(chain, blockA1)
    const blockA3 = await makeBlockAfter(chain, blockA2)
    const blockA4 = await makeBlockAfter(chain, blockA3)

    const blockB2 = await makeBlockAfter(chain, blockA1)
    const blockB3 = await makeBlockAfter(chain, blockB2)
    const blockB4 = await makeBlockAfter(chain, blockB3)
    const blockB5 = await makeBlockAfter(chain, blockB4)

    await expect(chain).toAddBlock(blockA1)
    await expect(chain).toAddBlock(blockA2)
    await expect(chain).toAddBlock(blockA3)
    await expect(chain).toAddBlock(blockA4)

    expect(chain.head.hash.equals(blockA4.header.hash)).toBe(true)
    expect(chain.latest.hash.equals(blockA4.header.hash)).toBe(true)

    const iter1 = chain.iterateTo(genesis, blockA4.header, undefined, false)

    const block1 = await iter1.next()
    const block2 = await iter1.next()
    const block3 = await iter1.next()

    expect(block1).toMatchObject({ done: false, value: { hash: genesis.hash } })
    expect(block2).toMatchObject({ done: false, value: { hash: blockA1.header.hash } })
    expect(block3).toMatchObject({ done: false, value: { hash: blockA2.header.hash } })

    await expect(chain).toAddBlock(blockB2)
    await expect(chain).toAddBlock(blockB3)
    await expect(chain).toAddBlock(blockB4)
    await expect(chain).toAddBlock(blockB5)

    expect(chain.head.hash.equals(blockB5.header.hash)).toBe(true)
    expect(chain.latest.hash.equals(blockB5.header.hash)).toBe(true)

    const block4 = await iter1.next()
    expect(block4).toMatchObject({ done: true })
  })

  it('iterate errors', async () => {
    const { strategy, chain } = nodeTest
    strategy.disableMiningReward()

    const genesis = chain.genesis

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

    const genesis = chain.genesis

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

  it('should update synced', () => {
    const nowSpy = jest.spyOn(Date, 'now')
    const syncedSpy = jest.spyOn(nodeTest.node.chain.onSynced, 'emit')

    // Empty chain should not be synced
    expect(nodeTest.node.chain.synced).toEqual(false)
    expect(syncedSpy).not.toHaveBeenCalled()

    // Genesis block is a too far back to be synced
    nowSpy.mockReturnValue(Number.MAX_SAFE_INTEGER)
    expect(nodeTest.node.chain.head).toEqual(nodeTest.chain.genesis)
    expect(nodeTest.node.chain.synced).toEqual(false)
    expect(syncedSpy).not.toHaveBeenCalled()

    // Set now to genesis block creation time to consider it synced
    nowSpy.mockReturnValue(nodeTest.chain.genesis.timestamp.valueOf())
    nodeTest.node.chain['updateSynced']()
    expect(nodeTest.node.chain.synced).toEqual(true)
    expect(syncedSpy).toHaveBeenCalledTimes(1)

    // Once it's true, it stays true
    nowSpy.mockReturnValue(Number.MAX_SAFE_INTEGER)
    nodeTest.node.chain['updateSynced']()
    expect(nodeTest.node.chain.synced).toEqual(true)
    expect(syncedSpy).toHaveBeenCalledTimes(1)

    nowSpy.mockRestore()
  })

  it('abort reorg after verify error', async () => {
    const { node: nodeA } = await nodeTest.createSetup()
    const { node: nodeB } = await nodeTest.createSetup()

    const blockA1 = await useMinerBlockFixture(nodeA.chain, 2)
    await expect(nodeA.chain).toAddBlock(blockA1)
    const blockA2 = await useMinerBlockFixture(nodeA.chain, 2)
    await expect(nodeA.chain).toAddBlock(blockA2)
    const blockA3 = await useMinerBlockFixture(nodeA.chain, 2)
    await expect(nodeA.chain).toAddBlock(blockA3)

    const blockB1 = await useMinerBlockFixture(nodeB.chain, 2)
    await expect(nodeB.chain).toAddBlock(blockB1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain, 3)
    await expect(nodeB.chain).toAddBlock(blockB2)
    const blockB3 = await useMinerBlockFixture(nodeB.chain, 4)
    await expect(nodeB.chain).toAddBlock(blockB3)

    // Now run the actual test...
    const node = nodeTest.node
    const genesis = nodeTest.chain.genesis
    expect(node.chain.head?.hash).toEqualBuffer(genesis.hash)

    blockB3.header.noteCommitment.size -= 2

    await expect(node.chain).toAddBlock(blockA1)
    expect(node.chain.head?.hash).toEqualBuffer(blockA1.header.hash)
    await expect(node.chain).toAddBlock(blockA2)
    expect(node.chain.head?.hash).toEqualBuffer(blockA2.header.hash)

    await expect(node.chain).toAddBlock(blockB1)
    await expect(node.chain).toAddBlock(blockB2)

    // Should not add blockB3
    const { isAdded, reason } = await node.chain.addBlock(blockB3)
    expect(isAdded).toBe(false)
    expect(reason).toBe(VerificationResultReason.NOTE_COMMITMENT_SIZE)

    expect(node.chain.head?.hash).toEqualBuffer(blockB2.header.hash)
    const result = await node.chain.verifier.verifyConnectedBlock(blockB2)
    expect(result.valid).toBe(true)

    await expect(node.chain).toAddBlock(blockA3)
    expect(node.chain.head?.hash).toEqualBuffer(blockA3.header.hash)
    expect(await node.chain.notes.size()).toBe(blockA3.header.noteCommitment.size)
  }, 60000)

  describe('MerkleTrees', () => {
    it('should add notes and nullifiers to trees', async () => {
      /**
       * This test will check that notes are added linearly, and also the trees
       * are reorganized for a heavier fork when a heavier fork appears
       *
       * G -> A1 -> A2
       *   -> B1 -> B2 -> B3
       */
      const { node: nodeA } = nodeTest
      const { node: nodeB } = await nodeTest.createSetup()

      const accountA = await useAccountFixture(nodeA.accounts, 'accountA')
      const accountB = await useAccountFixture(nodeB.accounts, 'accountB')

      // Counts before adding any blocks
      const countNoteA = await nodeA.chain.notes.size()
      const countNullifierA = await nodeA.chain.nullifiers.size()
      const countNoteB = await nodeB.chain.notes.size()
      const countNullifierB = await nodeB.chain.nullifiers.size()

      // Create nodeA blocks
      const blockA1 = await useMinerBlockFixture(nodeA.chain, 2, accountA)
      await expect(nodeA.chain).toAddBlock(blockA1)
      await nodeA.accounts.updateHead()

      const { block: blockA2 } = await useBlockWithTx(nodeA, accountA, accountA, false)
      await expect(nodeA.chain).toAddBlock(blockA2)

      // Create nodeB blocks
      const blockB1 = await useMinerBlockFixture(nodeB.chain, 2, accountB)
      await expect(nodeB.chain).toAddBlock(blockB1)
      await nodeB.accounts.updateHead()

      const blockB2 = await useMinerBlockFixture(nodeB.chain, 3, accountB)
      await expect(nodeB.chain).toAddBlock(blockB2)
      await nodeB.accounts.updateHead()

      const { block: blockB3 } = await useBlockWithTx(nodeB, accountB, accountB, false)
      await expect(nodeB.chain).toAddBlock(blockB3)

      expect(blockA1.transactions.length).toBe(1)
      expect(blockA2.transactions.length).toBe(2)
      expect(blockB1.transactions.length).toBe(1)
      expect(blockB2.transactions.length).toBe(1)
      expect(blockB3.transactions.length).toBe(2)

      const minersFeeA1 = blockA1.minersFee
      const minersFeeA2 = blockA2.minersFee
      const minersFeeB1 = blockB1.minersFee
      const minersFeeB2 = blockB2.minersFee
      const minersFeeB3 = blockB3.minersFee
      const txA2 = blockA2.transactions[1]
      const txB3 = blockB3.transactions[1]

      expect(minersFeeA1.notesLength()).toBe(1)
      expect(minersFeeA2.notesLength()).toBe(1)
      expect(minersFeeB1.notesLength()).toBe(1)
      expect(minersFeeB2.notesLength()).toBe(1)
      expect(minersFeeB3.notesLength()).toBe(1)
      expect(txA2.notesLength()).toBe(2)
      expect(txA2.spendsLength()).toBe(1)
      expect(txB3.notesLength()).toBe(2)
      expect(txB3.spendsLength()).toBe(1)

      // Check nodeA has notes from blockA1, blockA2
      expect(await nodeA.chain.notes.size()).toBe(countNoteA + 4)
      let addedNoteA1 = (await nodeA.chain.notes.getLeaf(countNoteA + 0)).element
      let addedNoteA2 = (await nodeA.chain.notes.getLeaf(countNoteA + 1)).element
      let addedNoteA3 = (await nodeA.chain.notes.getLeaf(countNoteA + 2)).element
      let addedNoteA4 = (await nodeA.chain.notes.getLeaf(countNoteA + 3)).element
      expect(addedNoteA1.serialize().equals(minersFeeA1.getNote(0).serialize())).toBe(true)
      expect(addedNoteA2.serialize().equals(minersFeeA2.getNote(0).serialize())).toBe(true)
      expect(addedNoteA3.serialize().equals(txA2.getNote(0).serialize())).toBe(true)
      expect(addedNoteA4.serialize().equals(txA2.getNote(1).serialize())).toBe(true)

      // Check nodeA has nullifiers from blockA2
      expect(await nodeA.chain.nullifiers.size()).toBe(countNullifierA + 1)
      let addedNullifierA1 = (await nodeA.chain.nullifiers.getLeaf(countNullifierA + 0)).element
      expect(addedNullifierA1.equals(txA2.getSpend(0).nullifier)).toBe(true)

      // Check nodeB has notes from blockB1, blockB2, blockB3
      expect(await nodeB.chain.notes.size()).toBe(countNoteB + 5)
      const addedNoteB1 = (await nodeB.chain.notes.getLeaf(countNoteB + 0)).element
      const addedNoteB2 = (await nodeB.chain.notes.getLeaf(countNoteB + 1)).element
      const addedNoteB3 = (await nodeB.chain.notes.getLeaf(countNoteB + 2)).element
      const addedNoteB4 = (await nodeB.chain.notes.getLeaf(countNoteB + 3)).element
      const addedNoteB5 = (await nodeB.chain.notes.getLeaf(countNoteB + 4)).element
      expect(addedNoteB1.serialize().equals(minersFeeB1.getNote(0).serialize())).toBe(true)
      expect(addedNoteB2.serialize().equals(minersFeeB2.getNote(0).serialize())).toBe(true)
      expect(addedNoteB3.serialize().equals(minersFeeB3.getNote(0).serialize())).toBe(true)
      expect(addedNoteB4.serialize().equals(txB3.getNote(0).serialize())).toBe(true)
      expect(addedNoteB5.serialize().equals(txB3.getNote(1).serialize())).toBe(true)

      // Check nodeB has nullifiers from blockB3
      expect(await nodeB.chain.nullifiers.size()).toBe(countNullifierB + 1)
      const addedNullifierB1 = (await nodeB.chain.nullifiers.getLeaf(countNullifierB + 0))
        .element
      expect(addedNullifierB1.equals(txB3.getSpend(0).nullifier)).toBe(true)

      // Now cause reorg on nodeA
      await nodeA.chain.addBlock(blockB1)
      await nodeA.chain.addBlock(blockB2)
      await nodeA.chain.addBlock(blockB3)

      // Check nodeA's chain has removed blockA1 notes and added blockB1, blockB2, blockB3
      expect(await nodeA.chain.notes.size()).toBe(countNoteA + 5)
      addedNoteA1 = (await nodeA.chain.notes.getLeaf(countNoteA + 0)).element
      addedNoteA2 = (await nodeA.chain.notes.getLeaf(countNoteA + 1)).element
      addedNoteA3 = (await nodeA.chain.notes.getLeaf(countNoteA + 2)).element
      addedNoteA4 = (await nodeA.chain.notes.getLeaf(countNoteA + 3)).element
      const addedNoteA5 = (await nodeA.chain.notes.getLeaf(countNoteA + 4)).element
      expect(addedNoteA1.serialize().equals(minersFeeB1.getNote(0).serialize())).toBe(true)
      expect(addedNoteA2.serialize().equals(minersFeeB2.getNote(0).serialize())).toBe(true)
      expect(addedNoteA3.serialize().equals(minersFeeB3.getNote(0).serialize())).toBe(true)
      expect(addedNoteA4.serialize().equals(txB3.getNote(0).serialize())).toBe(true)
      expect(addedNoteA5.serialize().equals(txB3.getNote(1).serialize())).toBe(true)

      // Check nodeA's chain has removed blockA2 nullifiers and added blockB3
      expect(await nodeA.chain.nullifiers.size()).toBe(countNullifierA + 1)
      addedNullifierA1 = (await nodeA.chain.nullifiers.getLeaf(countNullifierA + 0)).element
      expect(addedNullifierA1.equals(txB3.getSpend(0).nullifier)).toBe(true)
    }, 300000)

    it("throws if the note doesn't match the previously inserted note that position", async () => {
      const account = await useAccountFixture(nodeTest.accounts)
      const tx1 = await useMinersTxFixture(nodeTest.accounts, account)
      const tx2 = await useMinersTxFixture(nodeTest.accounts, account)
      const size = await nodeTest.chain.notes.size()

      await nodeTest.chain.addNote(size, tx1.getNote(0))

      await expect(nodeTest.chain.addNote(size, tx2.getNote(0))).rejects.toThrowError(
        `Tried to insert a note, but a different note already there for position 3`,
      )
    }, 30000)

    it('throws if the position is larger than the number of notes', async () => {
      const account = await useAccountFixture(nodeTest.accounts)
      const tx = await useMinersTxFixture(nodeTest.accounts, account)
      const size = await nodeTest.chain.notes.size()

      await expect(nodeTest.chain.addNote(size + 1, tx.getNote(0))).rejects.toThrowError(
        `Can't insert a note at index 4. Merkle tree has a count of 3`,
      )
    }, 30000)

    it("throws if the nullifier doesn't match the previously inserted note that position", async () => {
      const { transaction } = await useTxSpendsFixture(nodeTest.node)

      await expect(
        nodeTest.chain.addNullifier(0, transaction.getSpend(0).nullifier),
      ).rejects.toThrowError(
        `Tried to insert a nullifier, but a different nullifier already there for position 0`,
      )
    }, 60000)

    it('throws if the position is larger than the number of nullifiers', async () => {
      const { transaction } = await useTxSpendsFixture(nodeTest.node)
      const size = await nodeTest.chain.nullifiers.size()

      await expect(
        nodeTest.chain.addNullifier(size + 1, transaction.getSpend(0).nullifier),
      ).rejects.toThrowError(
        `Can't insert a nullifier at index 2. Merkle tree has a count of 1`,
      )
    }, 30000)
  })

  it('newBlock throws an error if the provided transactions are invalid', async () => {
    const minersFee = await useMinersTxFixture(nodeTest.accounts)

    jest.spyOn(nodeTest.verifier, 'verifyTransaction').mockResolvedValue({
      valid: false,
      reason: VerificationResultReason.INVALID_MINERS_FEE,
    })

    await expect(nodeTest.chain.newBlock([], minersFee)).rejects.toThrowError(
      `Miner's fee is incorrect`,
    )
  }, 60000)

  it('should wait to validate spends', async () => {
    /**
     * This test is used to validate that we don't verify the spend
     * root commitments when adding to a fork because the trees are
     * not valid in the forked blocks state. We should wait to validate
     * them once we reorg to the new chain. Before this PR it would fail
     * https://github.com/iron-fish/ironfish/pull/393
     *
     * G -> A1 -> A2 -> A3 -> A4 -> A5
     *   -> B1 -> B2 -> B3 -> B4
     */

    const { node: nodeA } = await nodeTest.createSetup()
    const { node: nodeB } = await nodeTest.createSetup()

    const { previous: blockA1, block: blockA2 } = await useBlockWithTx(nodeA)
    await expect(nodeA.chain).toAddBlock(blockA2)

    const blockA3 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA3)

    const blockA4 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA4)

    const blockA5 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA5)

    const blockB1 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB1)

    const blockB2 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB2)

    // blockB3 is created and added by the fixture automatically
    const { block: blockB4 } = await useBlockWithTx(nodeB)
    await expect(nodeB.chain).toAddBlock(blockB4)

    expect(nodeA.chain.head.hash.equals(blockA5.header.hash)).toBe(true)
    expect(nodeB.chain.head.hash.equals(blockB4.header.hash)).toBe(true)

    // If we add A1 to nodeB it should not re-org yet
    await expect(nodeB.chain).toAddBlock(blockA1)
    expect(nodeB.chain.head.hash.equals(blockB4.header.hash)).toBe(true)

    // This should succeed but before the fix it would fail
    const result = await nodeB.chain.addBlock(blockA2)
    expect(result).toMatchObject({ isAdded: true, reason: null })

    // Head should still be blockB4
    expect(nodeB.chain.head.hash.equals(blockB4.header.hash)).toBe(true)

    await expect(nodeB.chain).toAddBlock(blockA3)
    await expect(nodeB.chain).toAddBlock(blockA4)
    await expect(nodeB.chain).toAddBlock(blockA5)

    // We should have reorged to blockA5
    expect(nodeB.chain.head.hash.equals(blockA5.header.hash)).toBe(true)
  }, 120000)

  it('should add block to fork with tx expiration', async () => {
    /**
     * The goal of this test is to ensure that transaction expiration
     * on a forked block is validated against the forked block, and
     * not the actual current head of the chain. Which it was not doing
     * at the time of writing this test.
     *
     * G -> A1 -> A2 -> A3
     *   -> B1 -> B2
     */
    const { node: nodeA } = await nodeTest.createSetup()
    const { node: nodeB } = await nodeTest.createSetup()

    const blockA1 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA1)

    const blockA2 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA2)

    const blockA3 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA3)

    const { previous: blockB1, block: blockB2 } = await useBlockWithTx(
      nodeB,
      undefined,
      undefined,
      undefined,
      { expiration: 4 },
    )

    await expect(nodeB.chain.hasBlock(blockB1.header.hash)).resolves.toBe(true)
    await expect(nodeB.chain).toAddBlock(blockB2)

    // When we add blockB2 it will be expired on the chain head, but not on the
    // block it's added to. Expiration is a function of the sequence that a
    // transaction can be added, and even if the head is past the expiration if
    // the block it's added to is not past that expiration then it should be
    // valid.
    await expect(nodeA.chain).toAddBlock(blockB1)
    await expect(nodeA.chain).toAddBlock(blockB2)

    expect(nodeA.chain.head.hash.equals(blockA3.header.hash)).toBe(true)
    expect(nodeB.chain.head.hash.equals(blockB2.header.hash)).toBe(true)
  })

  it('should remember invalid blocks', async () => {
    const { node } = await nodeTest.createSetup()
    const block = await useMinerBlockFixture(node.chain)

    let result = await node.chain.verifier.verifyBlockAdd(block, node.chain.genesis)
    expect(result).toMatchObject({
      valid: true,
    })

    block.header.timestamp = new Date(0)

    result = await node.chain.verifier.verifyBlockAdd(block, node.chain.genesis)
    expect(result).toMatchObject({
      valid: false,
      reason: VerificationResultReason.BLOCK_TOO_OLD,
    })

    expect(node.chain.isInvalid(block)).toBe(null)

    await expect(node.chain.addBlock(block)).resolves.toMatchObject({
      isAdded: false,
      reason: VerificationResultReason.BLOCK_TOO_OLD,
    })

    expect(node.chain.isInvalid(block)).toBe(VerificationResultReason.BLOCK_TOO_OLD)

    await expect(node.chain.addBlock(block)).resolves.toMatchObject({
      isAdded: false,
      reason: VerificationResultReason.BLOCK_TOO_OLD,
    })
  })

  it('reject block with null previous hash', async () => {
    const { node } = await nodeTest.createSetup()
    const block = await useMinerBlockFixture(node.chain)

    const result = await node.chain.verifier.verifyBlockAdd(block, null)
    expect(result).toMatchObject({
      valid: false,
      reason: VerificationResultReason.PREV_HASH_NULL,
    })
  })

  it('reject block with hash not matching previous hash', async () => {
    const { node } = await nodeTest.createSetup()

    const block = await useMinerBlockFixture(node.chain)
    await expect(node.chain).toAddBlock(block)

    //Force one byte of the hash to not match the previous hash of the block.
    node.chain.genesis.hash[0] = node.chain.genesis.hash[0] ^ 0xff

    const result = await node.chain.verifier.verifyBlockAdd(block, node.chain.genesis)
    expect(result).toMatchObject({
      valid: false,
      reason: VerificationResultReason.PREV_HASH_MISMATCH,
    })
  })

  it('reject added block with invalid miners fee', async () => {
    const { node } = await nodeTest.createSetup()
    const block = await useMinerBlockFixture(node.chain)

    block.header.minersFee = BigInt(-1)

    const result = await node.chain.verifier.verifyBlockAdd(block, node.chain.genesis)
    expect(result).toMatchObject({
      valid: false,
      reason: VerificationResultReason.MINERS_FEE_MISMATCH,
    })
  })
})
