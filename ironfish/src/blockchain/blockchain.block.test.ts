/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Target } from './target'
import { RangeHasher } from '../merkletree'
import {
  addNotes,
  blockHash,
  makeFakeBlock,
  makeChainInitial,
  syncCommitments,
  TestStrategy,
  TestBlockchain,
  TestTransaction,
  makeNullifier,
  makeNextBlock,
} from '../captain/testUtilities'

describe('Block matches', () => {
  const strategy = new TestStrategy(new RangeHasher())

  it('is true for block that passes all checks', async () => {
    const blockchain = await makeChainInitial(strategy)
    const header = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 3, 5).header
    await addNotes(blockchain, [1, 2, 3, 4, 5])
    await blockchain.nullifiers.add(Buffer.alloc(32))
    header.nullifierCommitment.commitment = await blockchain.nullifiers.rootHash()
    expect(await blockchain.verifier.blockMatchesTrees(header)).toBe(true)
  })
  it("is false if there aren't enough notes in the tree", async () => {
    const anchor = await makeChainInitial(strategy)
    const header = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 3, 5).header
    await addNotes(anchor, [1, 2, 3, 4])
    await anchor.nullifiers.add(Buffer.alloc(32))
    header.nullifierCommitment.commitment = await anchor.nullifiers.rootHash()
    expect(await anchor.verifier.blockMatchesTrees(header)).toBe(false)
  })
  it("is false if there aren't enough nullifiers in the tree", async () => {
    const anchor = await makeChainInitial(strategy)
    const header = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 3, 5).header
    await addNotes(anchor, [1, 2, 3, 4, 5])
    await anchor.nullifiers.add(Buffer.alloc(32))
    const secondNullifier = Buffer.alloc(32)
    secondNullifier[0] = 1
    await anchor.nullifiers.add(secondNullifier)
    header.nullifierCommitment.commitment = await anchor.nullifiers.rootHash()
    header.nullifierCommitment.size = 8
    expect(await anchor.verifier.blockMatchesTrees(header)).toBe(false)
  })
  it('is false if the note hash is incorrect', async () => {
    const anchor = await makeChainInitial(strategy)
    const header = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 3, 5).header

    await addNotes(anchor, [1, 2, 3, 4, 5])
    await anchor.nullifiers.add(Buffer.alloc(32))
    header.nullifierCommitment.commitment = await anchor.nullifiers.rootHash()
    header.noteCommitment.commitment = 'NOOO'
    expect(await anchor.verifier.blockMatchesTrees(header)).toBe(false)
  })
  it('is false for block that has incorrect nullifier hash', async () => {
    const anchor = await makeChainInitial(strategy)
    const header = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 3, 5).header
    await addNotes(anchor, [1, 2, 3, 4, 5])
    await anchor.nullifiers.add(Buffer.alloc(32))
    expect(await anchor.verifier.blockMatchesTrees(header)).toBe(false)
  })
})

describe('Anchorchain adding', () => {
  const strategy = new TestStrategy(new RangeHasher())
  let blockchain: TestBlockchain
  let listener: jest.Mock
  let targetSpy: jest.SpyInstance

  beforeEach(async () => {
    targetSpy = jest.spyOn(Target, 'minDifficulty').mockImplementation(() => BigInt(1))
    blockchain = await makeChainInitial(strategy)
    listener = jest.fn()
    blockchain.onChainHeadChange.on(listener)
  })

  afterAll(() => {
    targetSpy.mockClear()
  })

  it('constructs an empty chain', async () => {
    expect(await blockchain.notes.size()).toBe(0)
    expect(await blockchain.nullifiers.size()).toBe(0)
    expect(await blockchain.isEmpty()).toBe(true)
    expect(listener).not.toBeCalled()
  })

  it('adds a genesis block', async () => {
    expect(await blockchain.hasGenesisBlock()).toBe(false)
    expect(await blockchain.isEmpty()).toBe(true)

    const block = makeFakeBlock(strategy, blockHash(0), blockHash(1), 1, 1, 5)
    block.transactions[0]._spends.push({
      nullifier: Buffer.alloc(32),
      commitment: 'something',
      size: 1,
    })
    await addNotes(blockchain, [1, 2, 3, 4, 5])
    await blockchain.nullifiers.add(Buffer.alloc(32))
    await syncCommitments(block.header, blockchain)
    const addedBlockResult = await blockchain.addBlock(block)
    expect(addedBlockResult.isAdded).toBe(true)
    expect(await blockchain.notes.size()).toBe(5)
    expect(await blockchain.nullifiers.size()).toBe(1)
    expect((await blockchain.getHeaviestHead())?.hash).toEqualHash(blockHash(1))

    expect(await blockchain.isEmpty()).toBe(false)
    expect(await blockchain.hasGenesisBlock()).toBe(true)
  })
})

describe('New block', () => {
  const strategy = new TestStrategy(new RangeHasher())
  let blockchain: TestBlockchain
  let listener: jest.Mock
  let targetSpy: jest.SpyInstance
  let targetMeetsSpy: jest.SpyInstance

  beforeEach(async () => {
    targetSpy = jest.spyOn(Target, 'minDifficulty').mockImplementation(() => BigInt(1))
    targetMeetsSpy = jest.spyOn(Target, 'meets').mockImplementation(() => true)
    blockchain = await makeChainInitial(strategy)
    listener = jest.fn()
    blockchain.onChainHeadChange.on(listener)
  })

  afterAll(() => {
    jest.useRealTimers()
    targetSpy.mockClear()
    targetMeetsSpy.mockClear()
  })

  it('creates a new block on an empty chain without failing', async () => {
    const chain = await makeChainInitial(strategy)
    await chain.notes.add('0')
    await chain.nullifiers.add(makeNullifier(0))
    const genesis = await makeNextBlock(chain, true)
    await chain.addBlock(genesis)

    const block = await makeNextBlock(chain)
    await chain.addBlock(block)

    expect(await blockchain.notes.size()).toBe(0)
    expect(await blockchain.nullifiers.size()).toBe(0)
    expect(await blockchain.getHeaviestHead()).toBe(null)
    expect(listener).not.toBeCalled()
  })

  it('throws an error if the provided transactions are invalid', async () => {
    await blockchain.nullifiers.add(Buffer.alloc(32))
    const block1 = makeFakeBlock(strategy, blockHash(0), blockHash(1), 1, 1, 2)
    block1.transactions[0]._spends.push({
      nullifier: Buffer.alloc(32),
      commitment: '1-1',
      size: 1,
    })
    block1.header.nullifierCommitment.commitment = await blockchain.nullifiers.rootHash()
    const block2 = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 3, 5)
    await blockchain.addBlock(block1)
    await blockchain.addBlock(block2)
    const fakeBlock = makeFakeBlock(strategy, blockHash(0), blockHash(0), 1, 9, 14)
    fakeBlock.transactions[0]._spends.push({
      nullifier: Buffer.alloc(32),
      commitment: '1-1',
      size: 2,
    })
    const minersFee = new TestTransaction(true, ['1'], 1)
    await expect(
      blockchain.newBlock(fakeBlock.transactions, minersFee),
    ).rejects.toMatchInlineSnapshot(`[Error: Miner's fee is incorrect]`)
  })
})
