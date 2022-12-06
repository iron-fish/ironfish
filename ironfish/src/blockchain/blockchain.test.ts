/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset, generateKey } from '@ironfish/rust-nodejs'
import { chain } from 'lodash'
import { Assert } from '../assert'
import { VerificationResultReason } from '../consensus'
import { IronfishNode } from '../node'
import { Block } from '../primitives'
import {
  createNodeTest,
  useAccountFixture,
  useBlockFixture,
  useBlockWithTx,
  useMinerBlockFixture,
  useMinersTxFixture,
  useRawTxFixture,
  useTxFixture,
  useTxMintsAndBurnsFixture,
  useTxSpendsFixture,
} from '../testUtilities'
import { makeBlockAfter } from '../testUtilities/helpers/blockchain'
import { AsyncUtils } from '../utils'
import { Account } from '../wallet'
import { Blockchain } from './blockchain'

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
  })

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
  })

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

    blockB3.header.noteCommitment = Buffer.alloc(32)

    await expect(node.chain).toAddBlock(blockA1)
    expect(node.chain.head?.hash).toEqualBuffer(blockA1.header.hash)
    await expect(node.chain).toAddBlock(blockA2)
    expect(node.chain.head?.hash).toEqualBuffer(blockA2.header.hash)

    await expect(node.chain).toAddBlock(blockB1)
    await expect(node.chain).toAddBlock(blockB2)

    // Should not add blockB3
    const { isAdded, reason } = await node.chain.addBlock(blockB3)
    expect(isAdded).toBe(false)
    expect(reason).toBe(VerificationResultReason.NOTE_COMMITMENT)

    expect(node.chain.head?.hash).toEqualBuffer(blockB2.header.hash)
    const result = await node.chain.verifier.verifyConnectedBlock(blockB2)
    expect(result.valid).toBe(true)

    await expect(node.chain).toAddBlock(blockA3)
    expect(node.chain.head?.hash).toEqualBuffer(blockA3.header.hash)
    expect(await node.chain.notes.size()).toBe(blockA3.header.noteSize)
  })

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

      const accountA = await useAccountFixture(nodeA.wallet, 'accountA')
      const accountB = await useAccountFixture(nodeB.wallet, 'accountB')

      // Counts before adding any blocks
      const countNoteA = await nodeA.chain.notes.size()
      const countNullifierA = await nodeA.chain.nullifiers.size()
      const countNoteB = await nodeB.chain.notes.size()
      const countNullifierB = await nodeB.chain.nullifiers.size()

      // Create nodeA blocks
      const blockA1 = await useMinerBlockFixture(nodeA.chain, 2, accountA)
      await expect(nodeA.chain).toAddBlock(blockA1)
      await nodeA.wallet.updateHead()

      const { block: blockA2 } = await useBlockWithTx(nodeA, accountA, accountA, false)
      await expect(nodeA.chain).toAddBlock(blockA2)

      // Create nodeB blocks
      const blockB1 = await useMinerBlockFixture(nodeB.chain, 2, accountB)
      await expect(nodeB.chain).toAddBlock(blockB1)
      await nodeB.wallet.updateHead()

      const blockB2 = await useMinerBlockFixture(nodeB.chain, 3, accountB)
      await expect(nodeB.chain).toAddBlock(blockB2)
      await nodeB.wallet.updateHead()

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

    it(`throws if the notes tree size is greater than the previous block's note tree size`, async () => {
      const account = await useAccountFixture(nodeTest.wallet)
      const tx = await useMinersTxFixture(nodeTest.wallet, account)
      const block = await useMinerBlockFixture(nodeTest.chain)

      await nodeTest.chain.notes.add(tx.getNote(0))

      await expect(nodeTest.chain.addBlock(block)).rejects.toThrowError(
        'Notes tree must match previous block header',
      )
    }, 30000)

    it('throws if the position is larger than the number of nullifiers', async () => {
      const { transaction } = await useTxSpendsFixture(nodeTest.node)
      const block = await useMinerBlockFixture(nodeTest.chain)

      await nodeTest.chain.nullifiers.add(transaction.getSpend(0).nullifier)

      await expect(nodeTest.chain.addBlock(block)).rejects.toThrowError(
        'Nullifier tree must match previous block header',
      )
    }, 30000)
  })

  it('newBlock throws an error if the provided transactions are invalid', async () => {
    const minersFee = await useMinersTxFixture(nodeTest.wallet)

    jest.spyOn(nodeTest.verifier['workerPool'], 'verifyTransactions').mockResolvedValue({
      valid: false,
      reason: VerificationResultReason.INVALID_MINERS_FEE,
    })

    await expect(nodeTest.chain.newBlock([], minersFee)).rejects.toThrowError(
      `Miner's fee is incorrect`,
    )
  })

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
  })

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

    expect(node.chain.isInvalid(block.header)).toBe(null)

    await expect(node.chain.addBlock(block)).resolves.toMatchObject({
      isAdded: false,
      reason: VerificationResultReason.BLOCK_TOO_OLD,
    })

    expect(node.chain.isInvalid(block.header)).toBe(VerificationResultReason.BLOCK_TOO_OLD)

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

  it('rejects double spend transactions', async () => {
    const { node, chain } = await nodeTest.createSetup()

    const accountA = await useAccountFixture(node.wallet, 'accountA')
    const accountB = await useAccountFixture(node.wallet, 'accountB')

    const block2 = await useMinerBlockFixture(chain, 2, accountA)
    await expect(chain).toAddBlock(block2)

    // Now create the double spend
    await node.wallet.updateHead()
    const tx = await useTxFixture(node.wallet, accountA, accountB)

    // Spend the transaaction for the first time
    const block3 = await useMinerBlockFixture(node.chain, 3, undefined, undefined, [tx])
    await expect(node.chain).toAddBlock(block3)

    // Spend the transaction a second time
    const block4 = await useMinerBlockFixture(node.chain, 4, undefined, undefined, [tx])
    await expect(node.chain.addBlock(block4)).resolves.toMatchObject({
      isAdded: false,
      reason: VerificationResultReason.DOUBLE_SPEND,
    })
  })

  it('rejects double spend during reorg', async () => {
    /**
     * We don't check double spends when connecting forks because we don't rebuild the nullifier
     * set unless we're adding to the head. If we re-org to a fork that contains a double spend
     * though, we should catch that
     *
     * G -> A2 -> A3 -> A4 -> A5
     *   -> B2 -> B3* -> B4* -> B5 -> B6
     */

    const { node: nodeA } = await nodeTest.createSetup()
    const { node: nodeB } = await nodeTest.createSetup()

    const blockA2 = await useMinerBlockFixture(nodeA.chain, 2)
    await expect(nodeA.chain).toAddBlock(blockA2)
    const blockA3 = await useMinerBlockFixture(nodeA.chain, 3)
    await expect(nodeA.chain).toAddBlock(blockA3)
    const blockA4 = await useMinerBlockFixture(nodeA.chain, 4)
    await expect(nodeA.chain).toAddBlock(blockA4)
    const blockA5 = await useMinerBlockFixture(nodeA.chain, 5)
    await expect(nodeA.chain).toAddBlock(blockA5)

    // create one more block to add at the end
    const blockA6 = await useMinerBlockFixture(nodeA.chain, 6)

    const accountA = await useAccountFixture(nodeB.wallet, 'accountA')
    const accountB = await useAccountFixture(nodeB.wallet, 'accountB')

    // Now create the double spend chain
    const blockB2 = await useMinerBlockFixture(nodeB.chain, 2, accountA)
    await expect(nodeB.chain).toAddBlock(blockB2)

    // Now create the double spend tx
    await nodeB.wallet.updateHead()
    const tx = await useTxFixture(nodeB.wallet, accountA, accountB)

    const blockB3 = await useMinerBlockFixture(nodeB.chain, 3, undefined, undefined, [tx])
    await expect(nodeB.chain).toAddBlock(blockB3)

    const blockB4 = await useMinerBlockFixture(nodeB.chain, 4, undefined, undefined, [tx])

    await expect(nodeB.chain).toAddDoubleSpendBlock(blockB4)

    const blockB5 = await useMinerBlockFixture(nodeB.chain, 5)
    await expect(nodeB.chain).toAddBlock(blockB5)

    const blockB6 = await useMinerBlockFixture(nodeB.chain, 6)
    await expect(nodeB.chain).toAddBlock(blockB6)

    // Now start adding the double spend chain until we reorg to it
    await expect(nodeA.chain.addBlock(blockB2)).resolves.toMatchObject({
      isAdded: true,
      isFork: true,
    })

    await expect(nodeA.chain.addBlock(blockB3)).resolves.toMatchObject({
      isAdded: true,
      isFork: true,
    })

    await expect(nodeA.chain.addBlock(blockB4)).resolves.toMatchObject({
      isAdded: true,
      isFork: true,
    })

    const addedB5 = await nodeA.chain.addBlock(blockB5)
    const addedB6 = await nodeA.chain.addBlock(blockB6)

    if (!addedB5.isAdded) {
      expect(nodeA.chain.head.hash.equals(blockB3.header.hash)).toBe(true)
      expect(addedB5).toMatchObject({
        isAdded: false,
        isFork: null,
        reason: VerificationResultReason.DOUBLE_SPEND,
      })
    } else {
      expect(nodeA.chain.head.hash.equals(blockB3.header.hash)).toBe(true)
      expect(addedB5).toMatchObject({
        isAdded: true,
        isFork: true,
      })

      expect(addedB6).toMatchObject({
        isAdded: false,
        isFork: null,
        reason: VerificationResultReason.DOUBLE_SPEND,
      })
    }

    // The chain should re-org back to the valid chain once it sees the next block
    await expect(nodeA.chain).toAddBlock(blockA6)
    expect(nodeA.chain.head.hash.equals(blockA6.header.hash)).toBe(true)
  })

  it('does not grant mining reward after V3_DISABLE_MINING_REWARD', async () => {
    const { node } = await nodeTest.createSetup()
    node.chain.consensus.V3_DISABLE_MINING_REWARD = 3
    const account = await useAccountFixture(node.wallet)

    const block1 = await useMinerBlockFixture(node.chain, 2, account)
    expect(block1.minersFee.fee()).toEqual(-20n * 10n ** 8n)
    expect(block1.minersFee.spendsLength()).toEqual(0)
    expect(block1.minersFee.notesLength()).toEqual(1)
    await expect(node.chain).toAddBlock(block1)

    const block2 = await useMinerBlockFixture(node.chain, 3, account)
    expect(block2.minersFee.fee()).toEqual(0n)
    expect(block2.minersFee.spendsLength()).toEqual(0)
    expect(block2.minersFee.notesLength()).toEqual(1)
    await expect(node.chain).toAddBlock(block2)

    await node.wallet.updateHead()
  })

  describe.only('asset updates', () => {
    async function mintAsset(node: IronfishNode, account: Account, sequence: number, asset: Asset, value: bigint): Promise<Block> {
        const transaction = await node.wallet.createTransaction(
          account,
          [],
          [
            { asset, value }
          ],
          [],
          BigInt(0),
          0,
        )

      return node.chain.newBlock(
        [transaction],
        await node.strategy.createMinersFee(transaction.fee(), sequence, account.spendingKey),
      )
    }

    async function burnAsset(node: IronfishNode, account: Account, sequence: number, asset: Asset, value: bigint): Promise<Block> {
      const transaction = await node.wallet.createTransaction(
        account,
        [],
        [],
        [
          { asset, value }
        ],
        BigInt(0),
        0,
      )

      return node.chain.newBlock(
        [transaction],
        await node.strategy.createMinersFee(transaction.fee(), sequence, account.spendingKey),
      )
    }

    describe('with a mint description', () => {
      it('upserts an asset to the database', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
        const value = BigInt(10)

        const block = await mintAsset(node, account, 2, asset, value)
        await expect(node.chain).toAddBlock(block)

        const transactions = block.transactions
        expect(transactions).toHaveLength(2)
        const mintTransaction = transactions[1]

        const mintedAsset = await node.chain.assets.get(asset.identifier())
        expect(mintedAsset).toEqual({
          createdTransactionHash: mintTransaction.hash(),
          metadata: asset.metadata(),
          name: asset.name(),
          nonce: asset.nonce(),
          owner: asset.owner(),
          supply: value,
        })
      })
    })

    describe.only('with a burn description', () => {
      it.skip('decrements the asset supply from the database', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')

        const mintValue = BigInt(10)
        const blockA = await mintAsset(node, account, 2, asset, mintValue)
        await expect(node.chain).toAddBlock(blockA)
        await wallet.updateHead()

        const burnValue = BigInt(3)
        const blockB = await burnAsset(node, account, 3, asset, burnValue)
        await expect(node.chain).toAddBlock(blockB)

        console.log(Array.from(blockB.transactions[1].notes()))

        const mintedAsset = await node.chain.assets.get(asset.identifier())
        expect(mintedAsset).toMatchObject({
          supply: mintValue - burnValue,
        })
      })

      it('foo', async () => {
        // Setup
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
        console.log("ASSET", asset.identifier())
        console.log("NATIVE", Asset.nativeIdentifier())

        // Mint so we have an existing asset
        const mintValue = BigInt(10)
        const blockA = await mintAsset(node, account, 2, asset, mintValue)
        await expect(node.chain).toAddBlock(blockA)

        // Burn some value, use previous mint output as spend
        const burnValue = BigInt(3)
        let prevNote = blockA.transactions[1].getNote(0)
        let tx = await useRawTxFixture(node.chain, node.workerPool, account, [prevNote], [], [], [{asset, value: burnValue}])
        let b = await node.chain.newBlock(
          [tx],
          await node.strategy.createMinersFee(BigInt(0), 3, account.spendingKey),
        )
        await expect(node.chain).toAddBlock(b)

        const mintedAsset = await node.chain.assets.get(asset.identifier())
        console.log('ma', mintedAsset)
        expect(mintedAsset).toMatchObject({
          supply: mintValue - burnValue,
        })
      })
    })

    describe('with a subsequent mint', () => {
      it('should keep the same created transaction hash and increase the supply', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
        const firstMintValue = BigInt(10)

        const blockA = await mintAsset(node, account, 2, asset, firstMintValue)
        await expect(node.chain).toAddBlock(blockA)
        await wallet.updateHead()

        const secondMintValue = BigInt(2)
        const blockB = await mintAsset(node, account, 3, asset, secondMintValue)
        await expect(node.chain).toAddBlock(blockB)

        const transactions = blockA.transactions
        expect(transactions).toHaveLength(2)
        const firstMintTransaction = transactions[1]

        const mintedAsset = await node.chain.assets.get(asset.identifier())
        expect(mintedAsset).toEqual({
          createdTransactionHash: firstMintTransaction.hash(),
          metadata: asset.metadata(),
          name: asset.name(),
          nonce: asset.nonce(),
          owner: asset.owner(),
          supply: firstMintValue + secondMintValue,
        })
      })
    })

    describe('when the first mint gets rolled back', () => {
      it('should delete the asset', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
        const value = BigInt(10)

        const block = await mintAsset(node, account, 2, asset, value)
        await expect(node.chain).toAddBlock(block)

        await node.chain.removeBlock(block.header.hash)

        const mintedAsset = await node.chain.assets.get(asset.identifier())
        expect(mintedAsset).toBeUndefined()
      })
    })

    describe('when a subsequent mint gets rolled back', () => {
      it('should decrement the supply', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
        const firstMintValue = BigInt(10)

        const blockA = await mintAsset(node, account, 2, asset, firstMintValue)
        await expect(node.chain).toAddBlock(blockA)
        await wallet.updateHead()

        const secondMintValue = BigInt(2)
        const blockB = await mintAsset(node, account, 3, asset, secondMintValue)
        await expect(node.chain).toAddBlock(blockB)

        await node.chain.removeBlock(blockB.header.hash)

        const mintedAsset = await node.chain.assets.get(asset.identifier())
        expect(mintedAsset).toMatchObject({
          supply: firstMintValue,
        })
      })
    })

    describe('when a burn gets rolled back', () => {
      it('should increase the supply', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')

        const mintValue = BigInt(10)
        const blockA = await mintAsset(node, account, 2, asset, mintValue)
        await expect(node.chain).toAddBlock(blockA)
        await wallet.updateHead()

        const burnValue = BigInt(3)
        const blockB = await burnAsset(node, account, 3, asset, burnValue)
        await expect(node.chain).toAddBlock(blockB)

        await node.chain.removeBlock(blockB.header.hash)

        const mintedAsset = await node.chain.assets.get(asset.identifier())
        expect(mintedAsset).toMatchObject({
          supply: mintValue,
        })
      })
    })

    describe('when burning too much value', () => {
      it('throws an exception', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')

        const mintValue = BigInt(10)
        const blockA = await mintAsset(node, account, 2, asset, mintValue)
        await expect(node.chain).toAddBlock(blockA)
        await wallet.updateHead()

        const burnValue = BigInt(3)
        const blockB = await burnAsset(node, account, 3, asset, burnValue)
        await expect(node.chain).toAddBlock(blockB)

        const mintedAsset = await node.chain.assets.get(asset.identifier())
        expect(mintedAsset).toMatchObject({
          supply: mintValue - burnValue,
        })
      })
    })

    describe('when rolling back multiple mints and burns', () => {
      it('adjusts the supply accordingly', () => {})
    })
  })
})
