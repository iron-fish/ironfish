/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset, generateKey, Note as NativeNote } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import { VerificationResultReason } from '../consensus'
import { IronfishNode } from '../node'
import { Block, Note } from '../primitives'
import { NoteEncrypted } from '../primitives/noteEncrypted'
import { RawTransaction } from '../primitives/rawTransaction'
import {
  createNodeTest,
  SpendingAccount,
  useAccountFixture,
  useBlockFixture,
  useBlockWithRawTxFixture,
  useBlockWithTx,
  useMinerBlockFixture,
  useMinersTxFixture,
  useMintBlockFixture,
  usePostTxFixture,
  useTxFixture,
} from '../testUtilities'
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
  })

  it('add blocks with forks', async () => {
    const { chain } = nodeTest

    // G -> A1 -> A2
    //         -> B2 -> B3

    const { node: nodeA } = await nodeTest.createSetup()
    const blockA1 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA1)
    const blockA2 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA2)

    const { node: nodeB } = await nodeTest.createSetup()
    await expect(nodeB.chain).toAddBlock(blockA1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB2)
    const blockB3 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB3)

    // Added in a specific order for the test below
    // so that Genesis, A1, A2, have the same graph,
    // and B2 merges into graph [A1-A2], and [A1-A2] merge
    // into genesis block graph so [B2-B3] -> [A2,A2,Genesis]
    await expect(chain).toAddBlock(blockA1)
    await expect(chain).toAddBlock(blockA2)
    await expect(chain).toAddBlock(blockB2)
    await expect(chain).toAddBlock(blockB3)

    const headerA1 = await chain.getHeader(blockA1.header.hash)
    const headerA2 = await chain.getHeader(blockA2.header.hash)
    const headerB2 = await chain.getHeader(blockB2.header.hash)
    const headerB3 = await chain.getHeader(blockB3.header.hash)

    Assert.isNotNull(headerA1)
    Assert.isNotNull(headerA2)
    Assert.isNotNull(headerB2)
    Assert.isNotNull(headerB3)

    expect(chain.head.hash.equals(headerB3.hash)).toBe(true)
    expect(chain.latest.hash.equals(headerB3.hash)).toBe(true)

    // getNext
    expect((await chain.getNext(chain.genesis))?.hash?.equals(headerA1.hash)).toBe(true)
    expect((await chain.getNext(headerA1))?.hash?.equals(headerB2.hash)).toBe(true)
    expect(await chain.getNext(headerA2)).toBe(null)
    expect((await chain.getNext(headerB2))?.hash?.equals(headerB3.hash)).toBe(true)
    expect(await chain.getNext(headerB3)).toBe(null)

    // getPrevious
    expect(await chain.getPrevious(chain.genesis)).toBe(null)
    expect((await chain.getPrevious(headerA1))?.hash?.equals(chain.genesis.hash)).toBe(true)
    expect((await chain.getPrevious(headerB2))?.hash?.equals(headerA1.hash)).toBe(true)
    expect((await chain.getPrevious(headerB3))?.hash?.equals(headerB2.hash)).toBe(true)

    // getAtSequence
    expect((await chain.getHashAtSequence(1))?.equals(chain.genesis.hash)).toBe(true)
    expect((await chain.getHashAtSequence(2))?.equals(headerA1.hash)).toBe(true)
    expect((await chain.getHashAtSequence(3))?.equals(headerB2.hash)).toBe(true)
    expect((await chain.getHashAtSequence(4))?.equals(headerB3.hash)).toBe(true)
  })

  it('iterate', async () => {
    const { chain } = nodeTest

    // G -> A1 -> A2
    //         -> B2 -> B3
    //               -> C3 -> C4

    const { node: nodeA } = await nodeTest.createSetup()
    const blockA1 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA1)
    const blockA2 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA2)

    const { node: nodeB } = await nodeTest.createSetup()
    await expect(nodeB.chain).toAddBlock(blockA1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB2)
    const blockB3 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB3)

    const { node: nodeC } = await nodeTest.createSetup()
    await expect(nodeC.chain).toAddBlock(blockA1)
    await expect(nodeC.chain).toAddBlock(blockB2)
    const blockC3 = await useMinerBlockFixture(nodeC.chain)
    await expect(nodeC.chain).toAddBlock(blockC3)
    const blockC4 = await useMinerBlockFixture(nodeC.chain)
    await expect(nodeC.chain).toAddBlock(blockC4)

    await expect(chain).toAddBlock(blockA1)
    await expect(chain).toAddBlock(blockB2)
    await expect(chain).toAddBlock(blockB3)
    await expect(chain).toAddBlock(blockA2)
    await expect(chain).toAddBlock(blockC3)
    await expect(chain).toAddBlock(blockC4)

    expect(chain.head.hash.equals(blockC4.header.hash)).toBe(true)
    expect(chain.latest.hash.equals(blockC4.header.hash)).toBe(true)

    // should be able to start at the tail
    let blocks = await AsyncUtils.materialize(chain.iterateTo(chain.genesis, blockC4.header))
    expect(blocks.length).toBe(5)
    expect(blocks[0].hash.equals(chain.genesis.hash)).toBe(true)
    expect(blocks[1].hash.equals(blockA1.header.hash)).toBe(true)
    expect(blocks[2].hash.equals(blockB2.header.hash)).toBe(true)
    expect(blocks[3].hash.equals(blockC3.header.hash)).toBe(true)
    expect(blocks[4].hash.equals(blockC4.header.hash)).toBe(true)

    // should be able to start at the head
    blocks = await AsyncUtils.materialize(chain.iterateFrom(blockC4.header, chain.genesis))
    expect(blocks.length).toBe(5)
    expect(blocks[0].hash.equals(blockC4.header.hash)).toBe(true)
    expect(blocks[1].hash.equals(blockC3.header.hash)).toBe(true)
    expect(blocks[2].hash.equals(blockB2.header.hash)).toBe(true)
    expect(blocks[3].hash.equals(blockA1.header.hash)).toBe(true)
    expect(blocks[4].hash.equals(chain.genesis.hash)).toBe(true)

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
    blocks = await AsyncUtils.materialize(chain.iterateTo(chain.genesis, chain.genesis))
    expect(blocks.length).toBe(1)
    expect(blocks[0].hash.equals(chain.genesis.hash)).toBe(true)

    // If we iterate the same block, it should be yielded once
    blocks = await AsyncUtils.materialize(chain.iterateFrom(chain.genesis, chain.genesis))
    expect(blocks.length).toBe(1)
    expect(blocks[0].hash.equals(chain.genesis.hash)).toBe(true)
  })

  it('should not iterate and jump chains and throw error', async () => {
    const { chain } = nodeTest

    const genesis = chain.genesis

    // This test checks that when iterating a reorg is happening, we don't
    // suddenly jump chains while the table is being re-written when we don't
    // have a lock on the main chain table. We try to iterate to A2, then do a
    // reorg and see if the next iteration incorrectly yields B3.
    //
    // G -> A1 -> A2 -> A3 -> A4
    //         -> B2 -> B3 -> B4 -> B5

    const { node: nodeA } = await nodeTest.createSetup()
    const blockA1 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA1)
    const blockA2 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA2)
    const blockA3 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA3)
    const blockA4 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA4)

    const { node: nodeB } = await nodeTest.createSetup()
    await expect(nodeB.chain).toAddBlock(blockA1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB2)
    const blockB3 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB3)
    const blockB4 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB4)
    const blockB5 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB5)

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

    await expect(iter1.next()).rejects.toThrow('progress: 3/5')
  })

  it('should not iterate and jump chains and not throw error', async () => {
    const { chain } = nodeTest

    // This test checks that when iterating a reorg is happening, we don't
    // suddenly jump chains while the table is being re-written when we don't
    // have a lock on the main chain table. We try to iterate to A2, then do a
    // reorg and see if the next iteration incorrectly yields B3.
    //
    // G -> A1 -> A2 -> A3 -> A4
    //         -> B2 -> B3 -> B4 -> B5

    const { node: nodeA } = await nodeTest.createSetup()
    const blockA1 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA1)
    const blockA2 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA2)
    const blockA3 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA3)
    const blockA4 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA4)

    const { node: nodeB } = await nodeTest.createSetup()
    await expect(nodeB.chain).toAddBlock(blockA1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB2)
    const blockB3 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB3)
    const blockB4 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB4)
    const blockB5 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB5)

    await expect(chain).toAddBlock(blockA1)
    await expect(chain).toAddBlock(blockA2)
    await expect(chain).toAddBlock(blockA3)
    await expect(chain).toAddBlock(blockA4)

    expect(chain.head.hash.equals(blockA4.header.hash)).toBe(true)
    expect(chain.latest.hash.equals(blockA4.header.hash)).toBe(true)

    const iter1 = chain.iterateTo(chain.genesis, blockA4.header, undefined, false)

    const block1 = await iter1.next()
    const block2 = await iter1.next()
    const block3 = await iter1.next()

    expect(block1).toMatchObject({ done: false, value: { hash: chain.genesis.hash } })
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
    const { chain } = nodeTest

    // G -> A1 -> A2
    //   -> B1 -> B2

    const { node: nodeA } = await nodeTest.createSetup()
    const blockA1 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA1)
    const blockA2 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA2)

    const { node: nodeB } = await nodeTest.createSetup()
    const blockB1 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB2)

    await expect(chain).toAddBlock(blockA1)
    await expect(chain).toAddBlock(blockA2)
    await expect(chain).toAddBlock(blockB1)
    await expect(chain).toAddBlock(blockB2)

    // Cannot iterate between 2 forks when graph path happen to make it seem like
    // it can work, a few wrong blocks are yielded in this case

    // left-to-right
    let result = AsyncUtils.materialize(chain.iterateTo(blockA1.header, blockB2.header))
    await expect(result).rejects.toThrow('Failed to iterate between blocks on diverging forks')
    result = AsyncUtils.materialize(chain.iterateFrom(blockA1.header, blockB2.header))
    await expect(result).rejects.toThrow('Failed to iterate between blocks on diverging forks')

    // right-to-left
    result = AsyncUtils.materialize(chain.iterateTo(blockB2.header, blockA1.header))
    await expect(result).rejects.toThrow('Failed to iterate between blocks on diverging forks')
    result = AsyncUtils.materialize(chain.iterateFrom(blockB2.header, blockA1.header))
    await expect(result).rejects.toThrow('Failed to iterate between blocks on diverging forks')
  })

  it('findFork', async () => {
    const { chain } = nodeTest

    // G -> A1 -> A2
    //         -> B2 -> B3
    //               -> C3 -> C4
    //                     -> D4

    const { node: nodeA } = await nodeTest.createSetup()
    const blockA1 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA1)
    const blockA2 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA2)

    const { node: nodeB } = await nodeTest.createSetup()
    await expect(nodeB.chain).toAddBlock(blockA1)
    const blockB2 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB2)
    const blockB3 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB3)

    const { node: nodeC } = await nodeTest.createSetup()
    await expect(nodeC.chain).toAddBlock(blockA1)
    await expect(nodeC.chain).toAddBlock(blockB2)
    const blockC3 = await useMinerBlockFixture(nodeC.chain)
    await expect(nodeC.chain).toAddBlock(blockC3)
    const blockC4 = await useMinerBlockFixture(nodeC.chain)
    await expect(nodeC.chain).toAddBlock(blockC4)

    const { node: nodeD } = await nodeTest.createSetup()
    await expect(nodeD.chain).toAddBlock(blockA1)
    await expect(nodeD.chain).toAddBlock(blockB2)
    await expect(nodeD.chain).toAddBlock(blockC3)
    const blockD4 = await useMinerBlockFixture(nodeD.chain)
    await expect(nodeD.chain).toAddBlock(blockD4)

    await expect(chain).toAddBlock(blockA1)
    await expect(chain).toAddBlock(blockA2)
    await expect(chain).toAddBlock(blockB2)
    await expect(chain).toAddBlock(blockB3)
    await expect(chain).toAddBlock(blockC3)
    await expect(chain).toAddBlock(blockC4)
    await expect(chain).toAddBlock(blockD4)

    const fork1 = await chain.findFork(blockA1, blockA1)
    expect(fork1.hash.equals(blockA1.header.hash)).toBe(true)

    const fork2 = await chain.findFork(blockA1, blockA2)
    expect(fork2.hash.equals(blockA1.header.hash)).toBe(true)

    const fork3 = await chain.findFork(blockA2, blockB2)
    expect(fork3.hash.equals(blockA1.header.hash)).toBe(true)

    const fork4 = await chain.findFork(chain.genesis, blockD4)
    expect(fork4.hash.equals(chain.genesis.hash)).toBe(true)

    const fork5 = await chain.findFork(blockB3, blockD4)
    expect(fork5.hash.equals(blockB2.header.hash)).toBe(true)

    const fork6 = await chain.findFork(blockC4, blockD4)
    expect(fork6.hash.equals(blockC3.header.hash)).toBe(true)
  })

  it('abort reorg after verify error', async () => {
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
    const blockB3 = await useMinerBlockFixture(nodeB.chain)
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

  describe('MerkleTree + Nullifier Set', () => {
    it('should add notes to tree and nullifiers to set', async () => {
      /**
       * This test will check that notes are added linearly, and also the tree
       * is reorganized for a heavier fork when a heavier fork appears
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
      const blockA1 = await useMinerBlockFixture(nodeA.chain, undefined, accountA)
      await expect(nodeA.chain).toAddBlock(blockA1)
      await nodeA.wallet.updateHead()

      const { block: blockA2 } = await useBlockWithTx(nodeA, accountA, accountA, false)
      await expect(nodeA.chain).toAddBlock(blockA2)

      // Create nodeB blocks
      const blockB1 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
      await expect(nodeB.chain).toAddBlock(blockB1)
      await nodeB.wallet.updateHead()

      const blockB2 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
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

      expect(minersFeeA1.notes.length).toBe(1)
      expect(minersFeeA2.notes.length).toBe(1)
      expect(minersFeeB1.notes.length).toBe(1)
      expect(minersFeeB2.notes.length).toBe(1)
      expect(minersFeeB3.notes.length).toBe(1)
      expect(txA2.notes.length).toBe(2)
      expect(txA2.spends.length).toBe(1)
      expect(txB3.notes.length).toBe(2)
      expect(txB3.spends.length).toBe(1)

      // Check nodeA has notes from blockA1, blockA2
      expect(await nodeA.chain.notes.size()).toBe(countNoteA + 4)
      let addedNoteA1 = (await nodeA.chain.notes.getLeaf(countNoteA + 0)).merkleHash
      let addedNoteA2 = (await nodeA.chain.notes.getLeaf(countNoteA + 1)).merkleHash
      let addedNoteA3 = (await nodeA.chain.notes.getLeaf(countNoteA + 2)).merkleHash
      let addedNoteA4 = (await nodeA.chain.notes.getLeaf(countNoteA + 3)).merkleHash
      expect(addedNoteA1.equals(minersFeeA1.getNote(0).hash())).toBe(true)
      expect(addedNoteA2.equals(minersFeeA2.getNote(0).hash())).toBe(true)
      expect(addedNoteA3.equals(txA2.getNote(0).hash())).toBe(true)
      expect(addedNoteA4.equals(txA2.getNote(1).hash())).toBe(true)

      // Check nodeA has nullifiers from blockA2
      expect(await nodeA.chain.nullifiers.size()).toBe(countNullifierA + 1)

      let addedNullifierA1 = await nodeA.chain.nullifiers.get(txA2.getSpend(0).nullifier)
      expect(addedNullifierA1).toBeDefined()
      expect(addedNullifierA1?.equals(txA2.hash())).toBe(true)

      // Check nodeB has notes from blockB1, blockB2, blockB3
      expect(await nodeB.chain.notes.size()).toBe(countNoteB + 5)
      const addedNoteB1 = (await nodeB.chain.notes.getLeaf(countNoteB + 0)).merkleHash
      const addedNoteB2 = (await nodeB.chain.notes.getLeaf(countNoteB + 1)).merkleHash
      const addedNoteB3 = (await nodeB.chain.notes.getLeaf(countNoteB + 2)).merkleHash
      const addedNoteB4 = (await nodeB.chain.notes.getLeaf(countNoteB + 3)).merkleHash
      const addedNoteB5 = (await nodeB.chain.notes.getLeaf(countNoteB + 4)).merkleHash
      expect(addedNoteB1.equals(minersFeeB1.getNote(0).hash())).toBe(true)
      expect(addedNoteB2.equals(minersFeeB2.getNote(0).hash())).toBe(true)
      expect(addedNoteB3.equals(minersFeeB3.getNote(0).hash())).toBe(true)
      expect(addedNoteB4.equals(txB3.getNote(0).hash())).toBe(true)
      expect(addedNoteB5.equals(txB3.getNote(1).hash())).toBe(true)

      // Check nodeB has nullifiers from blockB3
      expect(await nodeB.chain.nullifiers.size()).toBe(countNullifierB + 1)
      const addedNullifierB1 = await nodeB.chain.nullifiers.get(txB3.getSpend(0).nullifier)
      expect(addedNullifierB1).toBeDefined()
      expect(addedNullifierB1?.equals(txB3.hash())).toBe(true)

      // Now cause reorg on nodeA
      await nodeA.chain.addBlock(blockB1)
      await nodeA.chain.addBlock(blockB2)
      await nodeA.chain.addBlock(blockB3)

      // Check nodeA's chain has removed blockA1 notes and added blockB1, blockB2, blockB3
      expect(await nodeA.chain.notes.size()).toBe(countNoteA + 5)
      addedNoteA1 = (await nodeA.chain.notes.getLeaf(countNoteA + 0)).merkleHash
      addedNoteA2 = (await nodeA.chain.notes.getLeaf(countNoteA + 1)).merkleHash
      addedNoteA3 = (await nodeA.chain.notes.getLeaf(countNoteA + 2)).merkleHash
      addedNoteA4 = (await nodeA.chain.notes.getLeaf(countNoteA + 3)).merkleHash
      const addedNoteA5 = (await nodeA.chain.notes.getLeaf(countNoteA + 4)).merkleHash
      expect(addedNoteA1.equals(minersFeeB1.getNote(0).hash())).toBe(true)
      expect(addedNoteA2.equals(minersFeeB2.getNote(0).hash())).toBe(true)
      expect(addedNoteA3.equals(minersFeeB3.getNote(0).hash())).toBe(true)
      expect(addedNoteA4.equals(txB3.getNote(0).hash())).toBe(true)
      expect(addedNoteA5.equals(txB3.getNote(1).hash())).toBe(true)

      // Check nodeA's chain has removed blockA2 nullifiers and added blockB3
      expect(await nodeA.chain.nullifiers.size()).toBe(countNullifierA + 1)
      addedNullifierA1 = await nodeA.chain.nullifiers.get(txB3.getSpend(0).nullifier)
      expect(addedNullifierA1).toBeDefined()
      expect(addedNullifierA1?.equals(txB3.hash())).toBe(true)
    }, 300000)

    it(`throws if the notes tree size is greater than the previous block's note tree size`, async () => {
      const account = await useAccountFixture(nodeTest.wallet)
      const tx = await useMinersTxFixture(nodeTest.wallet, account)
      const block = await useMinerBlockFixture(nodeTest.chain)

      await nodeTest.chain.notes.add(tx.getNote(0))

      await expect(nodeTest.chain.addBlock(block)).rejects.toThrow(
        'Notes tree must match previous block header',
      )
    }, 30000)
  })

  it('newBlock throws an error if the provided transactions are invalid', async () => {
    const minersFee = await useMinersTxFixture(nodeTest.wallet)

    jest.spyOn(nodeTest.verifier['workerPool'], 'verifyTransactions').mockResolvedValue({
      valid: false,
      reason: VerificationResultReason.INVALID_MINERS_FEE,
    })

    await expect(nodeTest.chain.newBlock([], minersFee)).rejects.toThrow(
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

    const block2 = await useMinerBlockFixture(chain, undefined, accountA)
    await expect(chain).toAddBlock(block2)

    // Now create the double spend
    await node.wallet.updateHead()
    const tx = await useTxFixture(node.wallet, accountA, accountB)

    // Spend the transaaction for the first time
    const block3 = await useMinerBlockFixture(node.chain, undefined, undefined, undefined, [tx])
    await expect(node.chain).toAddBlock(block3)

    // Spend the transaction a second time
    const block4 = await useMinerBlockFixture(node.chain, undefined, undefined, undefined, [tx])
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

    const blockA2 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA2)
    const blockA3 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA3)
    const blockA4 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA4)
    const blockA5 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA5)

    // create one more block to add at the end
    const blockA6 = await useMinerBlockFixture(nodeA.chain)

    const accountA = await useAccountFixture(nodeB.wallet, 'accountA')
    const accountB = await useAccountFixture(nodeB.wallet, 'accountB')

    // Now create the double spend chain
    const blockB2 = await useMinerBlockFixture(nodeB.chain, undefined, accountA)
    await expect(nodeB.chain).toAddBlock(blockB2)

    // Now create the double spend tx
    await nodeB.wallet.updateHead()
    const tx = await useTxFixture(nodeB.wallet, accountA, accountB)

    const blockB3 = await useMinerBlockFixture(nodeB.chain, undefined, undefined, undefined, [
      tx,
    ])
    await expect(nodeB.chain).toAddBlock(blockB3)

    const blockB4 = await useMinerBlockFixture(nodeB.chain, undefined, undefined, undefined, [
      tx,
    ])

    await expect(nodeB.chain).toAddDoubleSpendBlock(blockB4)

    const blockB5 = await useMinerBlockFixture(nodeB.chain)
    await expect(nodeB.chain).toAddBlock(blockB5)

    const blockB6 = await useMinerBlockFixture(nodeB.chain)
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

  describe('asset updates', () => {
    async function burnAsset(
      node: IronfishNode,
      account: SpendingAccount,
      sequence: number,
      asset: Asset,
      value: bigint,
      noteToBurn: NoteEncrypted,
    ): Promise<Block> {
      return useBlockWithRawTxFixture(
        node.chain,
        node.workerPool,
        account,
        [noteToBurn],
        [],
        [],
        [{ assetId: asset.id(), value }],
        sequence,
      )
    }

    describe('with a mint description', () => {
      it('upserts an asset to the database', async () => {
        const { node } = await nodeTest.createSetup()
        const account = await useAccountFixture(node.wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
        const mintData = {
          name: asset.name().toString('utf8'),
          metadata: asset.metadata().toString('utf8'),
          value: 10n,
        }

        const mint = await usePostTxFixture({
          node: node,
          wallet: node.wallet,
          from: account,
          mints: [mintData],
        })

        const block = await useMinerBlockFixture(node.chain, undefined, undefined, undefined, [
          mint,
        ])
        await expect(node.chain).toAddBlock(block)

        const mintedAsset = await node.chain.assets.get(asset.id())

        expect(mintedAsset).toEqual({
          createdTransactionHash: mint.hash(),
          id: asset.id(),
          metadata: asset.metadata(),
          name: asset.name(),
          owner: asset.owner(),
          supply: 10n,
        })
      })
    })

    describe('with a burn description', () => {
      it('decrements the asset supply from the database', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')

        // Mint so we have an existing asset
        const mintValue = BigInt(10)

        const blockA = await useMintBlockFixture({
          node,
          account,
          sequence: 2,
          asset,
          value: mintValue,
        })
        await expect(node.chain).toAddBlock(blockA)
        const transactions = blockA.transactions
        const mintTransaction = transactions[1]

        // Burn some value, use previous mint output as spend
        const burnValue = BigInt(3)
        const noteToBurn = blockA.transactions[1].getNote(0)
        const blockB = await burnAsset(node, account, 3, asset, burnValue, noteToBurn)
        await expect(node.chain).toAddBlock(blockB)

        const mintedAsset = await node.chain.assets.get(asset.id())
        expect(mintedAsset).toMatchObject({
          createdTransactionHash: mintTransaction.hash(),
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

        const mintValueA = BigInt(10)
        const blockA = await useMintBlockFixture({
          node,
          account,
          sequence: 2,
          asset,
          value: mintValueA,
        })
        await expect(node.chain).toAddBlock(blockA)
        const mintTransactionA = blockA.transactions[1]

        const mintValueB = BigInt(2)
        const blockB = await useMintBlockFixture({
          node,
          account,
          sequence: 3,
          asset,
          value: mintValueB,
        })
        await expect(node.chain).toAddBlock(blockB)

        const mintedAsset = await node.chain.assets.get(asset.id())
        expect(mintedAsset).toEqual({
          createdTransactionHash: mintTransactionA.hash(),
          id: asset.id(),
          metadata: asset.metadata(),
          name: asset.name(),
          owner: asset.owner(),
          supply: mintValueA + mintValueB,
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

        const block = await useMintBlockFixture({
          node,
          account,
          sequence: 2,
          asset,
          value,
        })
        await expect(node.chain).toAddBlock(block)

        await node.chain.removeBlock(block.header.hash)

        const mintedAsset = await node.chain.assets.get(asset.id())
        expect(mintedAsset).toBeUndefined()
      })
    })

    describe('when a subsequent mint gets rolled back', () => {
      it('should decrement the supply', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')

        const mintValueA = BigInt(10)
        const blockA = await useMintBlockFixture({
          node,
          account,
          sequence: 2,
          asset,
          value: mintValueA,
        })
        await expect(node.chain).toAddBlock(blockA)

        const mintValueB = BigInt(2)
        const blockB = await useMintBlockFixture({
          node,
          account,
          sequence: 3,
          asset,
          value: mintValueB,
        })
        await expect(node.chain).toAddBlock(blockB)

        await node.chain.removeBlock(blockB.header.hash)

        const mintedAsset = await node.chain.assets.get(asset.id())
        expect(mintedAsset).toMatchObject({
          supply: mintValueA,
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
        const blockA = await useMintBlockFixture({
          node,
          account,
          sequence: 2,
          asset,
          value: mintValue,
        })
        await expect(node.chain).toAddBlock(blockA)

        const burnValue = BigInt(3)
        const noteToBurn = blockA.transactions[1].getNote(0)
        const blockB = await burnAsset(node, account, 3, asset, burnValue, noteToBurn)
        await expect(node.chain).toAddBlock(blockB)

        await node.chain.removeBlock(blockB.header.hash)

        const mintedAsset = await node.chain.assets.get(asset.id())
        expect(mintedAsset).toMatchObject({
          supply: mintValue,
        })
      })
    })

    describe('when burning an asset not in the DB', () => {
      it('throws an exception', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
        const assetId = asset.id()

        const mintValue = BigInt(10)
        const blockA = await useMintBlockFixture({
          node,
          account,
          sequence: 2,
          asset,
          value: mintValue,
        })
        await expect(node.chain).toAddBlock(blockA)

        // Perform a hack where we manually delete the asset from the chain
        // database. This is done so we can check that a burn will throw an
        // exception if the DB does not have a corresponding asset. Without this
        // hack, the posted transaction would raise an exception, which is a
        // separate flow to test for. We should never hit this case; this is a
        // sanity check.
        await node.chain.assets.del(assetId)

        const burnValue = BigInt(3)
        const noteToBurn = blockA.transactions[1].getNote(0)
        const blockB = await burnAsset(node, account, 3, asset, burnValue, noteToBurn)
        await expect(node.chain.addBlock(blockB)).rejects.toThrow(
          'Cannot burn undefined asset from the database',
        )
      })
    })

    describe('when burning too much value', () => {
      it('throws an exception', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
        const assetId = asset.id()

        const mintValue = BigInt(10)
        const blockA = await useMintBlockFixture({
          node,
          account,
          sequence: 2,
          asset,
          value: mintValue,
        })
        await expect(node.chain).toAddBlock(blockA)

        const record = await node.chain.assets.get(assetId)
        Assert.isNotUndefined(record)
        // Perform a hack where we adjust the supply in the DB to be lower than
        // what was previously minted. This is done to check what happens if a
        // burn is processed but the DB does not have enough supply for a given
        // burn. Without this, the posted transaction would raise an invalid
        // balance exception, which is a separate flow to test for.
        await node.chain.assets.put(assetId, {
          ...record,
          supply: BigInt(1),
        })

        const burnValue = BigInt(3)
        const noteToBurn = blockA.transactions[1].getNote(0)
        const blockB = await burnAsset(node, account, 3, asset, burnValue, noteToBurn)
        await expect(node.chain.addBlock(blockB)).rejects.toThrow('Invalid burn value')
      })
    })

    describe('when rolling back multiple mints and burns', () => {
      it('adjusts the supply accordingly', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
        const assetId = asset.id()

        // 1. Mint 10
        const mintValueA = BigInt(10)
        const blockA = await useMintBlockFixture({
          node,
          account,
          sequence: 2,
          asset,
          value: mintValueA,
        })
        await expect(node.chain).toAddBlock(blockA)
        // Check first mint value
        let record = await node.chain.assets.get(assetId)
        Assert.isNotUndefined(record)
        expect(record).toMatchObject({
          createdTransactionHash: blockA.transactions[1].hash(),
          supply: mintValueA,
        })

        // 2. Mint 8
        const mintValueB = BigInt(8)
        const blockB = await useMintBlockFixture({
          node,
          account,
          sequence: 2,
          asset,
          value: mintValueB,
        })
        await expect(node.chain).toAddBlock(blockB)
        // Check aggregate mint value
        record = await node.chain.assets.get(assetId)
        Assert.isNotUndefined(record)
        expect(record).toMatchObject({
          createdTransactionHash: blockA.transactions[1].hash(),
          supply: mintValueA + mintValueB,
        })

        // 3. Burn 5
        const burnValueC = BigInt(5)
        const noteToBurnC = blockB.transactions[1].getNote(0)
        const blockC = await burnAsset(node, account, 4, asset, burnValueC, noteToBurnC)
        await expect(node.chain).toAddBlock(blockC)
        // Check value after burn
        record = await node.chain.assets.get(assetId)
        Assert.isNotUndefined(record)
        expect(record).toMatchObject({
          createdTransactionHash: blockA.transactions[1].hash(),
          supply: mintValueA + mintValueB - burnValueC,
        })

        // 4. Roll back the burn from Block C (Step 3 above)
        await node.chain.removeBlock(blockC.header.hash)
        // Check value after burn roll back
        record = await node.chain.assets.get(assetId)
        Assert.isNotUndefined(record)
        expect(record).toMatchObject({
          createdTransactionHash: blockA.transactions[1].hash(),
          supply: mintValueA + mintValueB,
        })

        // 5. Burn some more
        const burnValueD = BigInt(7)
        const noteToBurnD = blockB.transactions[1].getNote(0)
        const blockD = await burnAsset(node, account, 4, asset, burnValueD, noteToBurnD)
        await expect(node.chain).toAddBlock(blockD)
        // Check aggregate mint value
        record = await node.chain.assets.get(assetId)
        Assert.isNotUndefined(record)
        expect(record).toMatchObject({
          createdTransactionHash: blockA.transactions[1].hash(),
          supply: mintValueA + mintValueB - burnValueD,
        })

        // 6. Mint some more
        const mintValueE = BigInt(10)
        const blockE = await useMintBlockFixture({
          node,
          account,
          sequence: 5,
          asset,
          value: mintValueE,
        })
        await expect(node.chain).toAddBlock(blockE)
        // Check aggregate mint value
        record = await node.chain.assets.get(assetId)
        Assert.isNotUndefined(record)
        expect(record).toMatchObject({
          createdTransactionHash: blockA.transactions[1].hash(),
          supply: mintValueA + mintValueB - burnValueD + mintValueE,
        })

        // 7. Roll back the mint from Block E (Step 6 above)
        await node.chain.removeBlock(blockE.header.hash)
        // Check value after burn roll back
        record = await node.chain.assets.get(assetId)
        Assert.isNotUndefined(record)
        expect(record).toMatchObject({
          createdTransactionHash: blockA.transactions[1].hash(),
          supply: mintValueA + mintValueB - burnValueD,
        })
      })
    })

    describe('when an asset is minted on a fork', () => {
      it('undoes the mint when reorganizing the chain', async () => {
        const { node: nodeA } = await nodeTest.createSetup()
        const { node: nodeB } = await nodeTest.createSetup()
        const accountA = await useAccountFixture(nodeA.wallet, 'accountA')
        const accountB = await useAccountFixture(nodeB.wallet, 'accountB')

        const asset = new Asset(accountA.spendingKey, 'mint-asset', 'metadata')
        const mintValue = BigInt(10)
        const assetId = asset.id()

        // G -> A1
        //   -> B1 -> B2
        const blockA1 = await useMintBlockFixture({
          node: nodeA,
          account: accountA,
          sequence: 2,
          asset,
          value: mintValue,
        })
        await nodeA.chain.addBlock(blockA1)

        // Verify Node A has the asset
        let record = await nodeA.chain.assets.get(assetId)
        Assert.isNotUndefined(record)
        expect(record).toMatchObject({
          createdTransactionHash: blockA1.transactions[1].hash(),
          supply: mintValue,
        })

        const blockB1 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
        await nodeB.chain.addBlock(blockB1)
        const blockB2 = await useMinerBlockFixture(nodeB.chain, undefined, accountB)
        await nodeB.chain.addBlock(blockB2)

        // Verify Node B does not have the asset
        record = await nodeB.chain.assets.get(assetId)
        expect(record).toBeUndefined()

        // Reorganize the chain on Node A
        await nodeA.chain.addBlock(blockB1)
        await nodeA.chain.addBlock(blockB2)

        // Verify Node A no longer has the asset from Block A1
        expect(nodeA.chain.head.hash.equals(blockB2.header.hash)).toBe(true)
        record = await nodeA.chain.assets.get(assetId)
        expect(record).toBeUndefined()
      })
    })

    describe('when spending and burning the same note in a block', () => {
      it('fails validation as double spend', async () => {
        const { node } = await nodeTest.createSetup()
        const account = await useAccountFixture(node.wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
        const mintValue = BigInt(10)
        const assetId = asset.id()

        const block = await useMintBlockFixture({
          node: node,
          account: account,
          sequence: 2,
          asset,
          value: mintValue,
        })
        await expect(node.chain).toAddBlock(block)
        await node.wallet.updateHead()

        // Verify Node A has the asset
        const record = await node.chain.assets.get(assetId)
        Assert.isNotUndefined(record)
        expect(record).toMatchObject({
          createdTransactionHash: block.transactions[1].hash(),
          supply: mintValue,
        })

        const doubleSpend = await useBlockFixture(node.chain, async () => {
          // The note to double spend
          const note = await account.getDecryptedNote(block.transactions[1].getNote(0).hash())

          Assert.isNotUndefined(note)
          Assert.isNotNull(note.index)
          const witness = await node.chain.notes.witness(note.index)
          Assert.isNotNull(witness)

          const rawBurn = new RawTransaction()
          rawBurn.spends = [{ note: note.note, witness }]
          rawBurn.burns = [{ assetId, value: BigInt(2) }]

          const rawSend = new RawTransaction()
          rawSend.spends = [{ note: note.note, witness }]
          rawSend.outputs = [
            {
              note: new Note(
                new NativeNote(
                  account.publicAddress,
                  3n,
                  '',
                  assetId,
                  account.publicAddress,
                ).serialize(),
              ),
            },
          ]

          const burnTransaction = await node.workerPool.postTransaction(
            rawBurn,
            account.spendingKey,
          )
          const spendTransaction = await node.workerPool.postTransaction(
            rawSend,
            account.spendingKey,
          )
          const fee = burnTransaction.fee() + spendTransaction.fee()

          return node.chain.newBlock(
            [burnTransaction, spendTransaction],
            await node.strategy.createMinersFee(fee, 3, generateKey().spending_key),
          )
        })

        expect(await node.chain.addBlock(doubleSpend)).toMatchObject({
          isAdded: false,
          reason: VerificationResultReason.DOUBLE_SPEND,
        })
      })
    })
  })
})
