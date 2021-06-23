/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RangeHasher } from '../merkletree'
import { Block } from '../primitives/block'
import { Target } from '../primitives/target'
import {
  addNotes,
  blockHash,
  makeChainInitial,
  makeFakeBlock,
  makeNullifier,
  SerializedTestTransaction,
  TestBlockchain,
  TestStrategy,
  TestTransaction,
} from '../testUtilities/fake'

describe('Note adding', () => {
  const strategy = new TestStrategy(new RangeHasher())
  let blockchain: TestBlockchain
  let listener: jest.Mock
  let targetSpy: jest.SpyInstance
  beforeEach(async () => {
    targetSpy = jest.spyOn(Target, 'minDifficulty').mockReturnValue(BigInt(1))
    blockchain = await makeChainInitial(strategy)
    listener = jest.fn()
    blockchain.onHeadChange.on(listener)
  })

  afterAll(() => [targetSpy.mockClear()])

  it('immediately adds in order notes to the tree', async () => {
    await blockchain.addNote(0, 'zero')
    await blockchain.addNote(1, 'one')
    expect(await blockchain.notes.size()).toBe(2)
    expect(await blockchain.notes.get(0)).toBe('zero')
    expect(await blockchain.notes.get(1)).toBe('one')
    expect(await blockchain.nullifiers.size()).toBe(0)
    expect(listener).not.toBeCalled()
  })

  it("throws if the note doesn't match the previously inserted note that position", async () => {
    await blockchain.addNote(0, 'zero')
    await blockchain.addNote(1, 'one')
    await blockchain.addNote(2, 'two')
    await expect(blockchain.addNote(2, 'not two')).rejects.toThrowError(
      `Tried to insert a note, but a different note already there for position 2`,
    )
  })

  it('throws if the position is larger than the number of notes', async () => {
    await blockchain.addNote(0, 'zero')
    await blockchain.addNote(1, 'one')
    await blockchain.addNote(2, 'two')
    await expect(blockchain.addNote(4, 'not two')).rejects.toThrowError(
      `Can't insert a note at index 4. Merkle tree has a count of 3`,
    )
  })
})

describe('Nullifier adding', () => {
  const strategy = new TestStrategy(new RangeHasher())
  let blockchain: TestBlockchain
  let listener: jest.Mock
  beforeEach(async () => {
    blockchain = await makeChainInitial(strategy)
    listener = jest.fn()
    blockchain.onHeadChange.on(listener)
  })

  it('immediately adds in order nullifiers to the tree', async () => {
    const nullifier1 = Buffer.alloc(32)
    const nullifier2 = makeNullifier(1)
    await blockchain.addNullifier(0, nullifier1)
    await blockchain.addNullifier(1, nullifier2)
    expect(await blockchain.nullifiers.size()).toBe(2)
    expect(await blockchain.nullifiers.get(0)).toEqualNullifier(nullifier1)
    expect(await blockchain.nullifiers.get(1)).toEqualNullifier(nullifier2)
    expect(await blockchain.notes.size()).toBe(0)
    expect(listener).not.toBeCalled()
  })

  it("throws if the nullifier doesn't match the previously inserted nullifier in that position", async () => {
    const nullifier0 = Buffer.alloc(32)
    const nullifier1 = makeNullifier(1)
    const nullifier2 = makeNullifier(2)
    await blockchain.addNullifier(0, nullifier0)
    await blockchain.addNullifier(1, nullifier1)
    await blockchain.addNullifier(2, nullifier2)
    await expect(blockchain.addNullifier(2, nullifier0)).rejects.toThrowError(
      `Tried to insert a nullifier, but a different nullifier already there for position 2`,
    )
  })

  it('throws if the position is larger than the number of nullifiers', async () => {
    await blockchain.addNullifier(0, makeNullifier(0))
    await blockchain.addNullifier(1, makeNullifier(1))
    await blockchain.addNullifier(2, makeNullifier(2))
    await expect(blockchain.addNullifier(4, makeNullifier(4))).rejects.toThrowError(
      `Can't insert a nullifier at index 4. Merkle tree has a count of 3`,
    )
  })

  it('sixNullifierRoot matches expected rootHash', async () => {
    await blockchain.addNullifier(0, makeNullifier(0))
    await blockchain.addNullifier(1, makeNullifier(1))
    await blockchain.addNullifier(2, makeNullifier(2))
    await blockchain.addNullifier(3, makeNullifier(3))
    await blockchain.addNullifier(4, makeNullifier(4))
    await blockchain.addNullifier(5, makeNullifier(5))
    const rootHash = await blockchain.nullifiers.rootHash()
    expect(rootHash.equals(sixNullifierRoot)).toBeTruthy()
  })
})

const sixNullifierRoot = Buffer.from([
  225,
  164,
  205,
  91,
  37,
  68,
  206,
  32,
  128,
  69,
  41,
  50,
  240,
  78,
  211,
  128,
  227,
  49,
  167,
  139,
  132,
  31,
  71,
  88,
  44,
  71,
  19,
  28,
  204,
  126,
  14,
  152,
])

describe('Block matches', () => {
  const strategy = new TestStrategy(new RangeHasher())

  it('is true for block that passes all checks', async () => {
    const blockchain = await makeChainInitial(strategy)
    const header = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 3, 5).header
    await addNotes(blockchain, [1, 2, 3, 4, 5])
    await blockchain.nullifiers.add(Buffer.alloc(32))
    header.nullifierCommitment.commitment = await blockchain.nullifiers.rootHash()
    expect((await blockchain.verifier.blockMatchesTrees(header)).valid).toBe(true)
  })
  it("is false if there aren't enough notes in the tree", async () => {
    const anchor = await makeChainInitial(strategy)
    const header = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 3, 5).header
    await addNotes(anchor, [1, 2, 3, 4])
    await anchor.nullifiers.add(Buffer.alloc(32))
    header.nullifierCommitment.commitment = await anchor.nullifiers.rootHash()
    expect((await anchor.verifier.blockMatchesTrees(header)).valid).toBe(false)
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
    expect((await anchor.verifier.blockMatchesTrees(header)).valid).toBe(false)
  })
  it('is false if the note hash is incorrect', async () => {
    const anchor = await makeChainInitial(strategy)
    const header = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 3, 5).header

    await addNotes(anchor, [1, 2, 3, 4, 5])
    await anchor.nullifiers.add(Buffer.alloc(32))
    header.nullifierCommitment.commitment = await anchor.nullifiers.rootHash()
    header.noteCommitment.commitment = 'NOOO'
    expect((await anchor.verifier.blockMatchesTrees(header)).valid).toBe(false)
  })
  it('is false for block that has incorrect nullifier hash', async () => {
    const anchor = await makeChainInitial(strategy)
    const header = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 3, 5).header
    await addNotes(anchor, [1, 2, 3, 4, 5])
    await anchor.nullifiers.add(Buffer.alloc(32))
    expect((await anchor.verifier.blockMatchesTrees(header)).valid).toBe(false)
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
    blockchain.onHeadChange.on(listener)
  })

  afterAll(() => {
    jest.useRealTimers()
    targetSpy.mockClear()
    targetMeetsSpy.mockClear()
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

describe('Header consistency is valid against previous', () => {
  let strategy: TestStrategy
  let blockchain: TestBlockchain
  let block2: Block<string, string, TestTransaction, string, string, SerializedTestTransaction>
  let block3: Block<string, string, TestTransaction, string, string, SerializedTestTransaction>

  beforeEach(async () => {
    strategy = new TestStrategy(new RangeHasher())
    blockchain = await makeChainInitial(strategy)

    block2 = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 6, 9)
    block3 = makeFakeBlock(strategy, blockHash(2), blockHash(3), 3, 10, 13)
  })

  it("is invalid when the note commitments aren't the same size", async () => {
    block2.header.noteCommitment.size = 99
    await blockchain.addBlock(block2)
    await blockchain.addBlock(block3)

    expect(blockchain.verifier.isValidAgainstPrevious(block3, block3.header))
      .toMatchInlineSnapshot(`
        Object {
          "reason": "Note commitment sizes do not match",
          "valid": false,
        }
      `)
  })

  it("is invalid when the nullifier commitments aren't the same size", async () => {
    block2.header.nullifierCommitment.size = 99
    await blockchain.addBlock(block2)
    await blockchain.addBlock(block3)

    expect(blockchain.verifier.isValidAgainstPrevious(block3, block3.header))
      .toMatchInlineSnapshot(`
      Object {
        "reason": "Note commitment sizes do not match",
        "valid": false,
      }
    `)
  })

  it('Is invalid when the timestamp is in past', async () => {
    await blockchain.addBlock(block2)
    await blockchain.addBlock(block3)
    block3.header.timestamp = new Date(100)

    expect(blockchain.verifier.isValidAgainstPrevious(block3, block3.header))
      .toMatchInlineSnapshot(`
      Object {
        "reason": "Note commitment sizes do not match",
        "valid": false,
      }
    `)
  })

  it('Is invalid when the sequence is wrong', async () => {
    await blockchain.addBlock(block2)
    await blockchain.addBlock(block3)
    block3.header.sequence = 99

    expect(blockchain.verifier.isValidAgainstPrevious(block3, block3.header))
      .toMatchInlineSnapshot(`
      Object {
        "reason": "Note commitment sizes do not match",
        "valid": false,
      }
    `)
  })

  it('is valid when it is valid', async () => {
    await blockchain.addBlock(block2)
    await blockchain.addBlock(block3)

    expect(blockchain.verifier.isValidAgainstPrevious(block3, block3.header))
      .toMatchInlineSnapshot(`
      Object {
        "reason": "Note commitment sizes do not match",
        "valid": false,
      }
    `)
  })
})
