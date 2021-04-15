/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Target } from './target'
import Block from './block'
import { RangeHasher } from '../merkletree'
import {
  blockHash,
  makeFakeBlock,
  makeChainInitial,
  TestBlockchain,
  TestStrategy,
  TestTransaction,
  SerializedTestTransaction,
} from '../testUtilities/fake'
import { Validity } from '../consensus/verifier'

describe('Calculates valid spends', () => {
  const strategy = new TestStrategy(new RangeHasher())
  let blockchain: TestBlockchain

  beforeEach(async () => {
    blockchain = await makeChainInitial(strategy)
    await blockchain.notes.add('1')
    await blockchain.nullifiers.add(Buffer.alloc(32))
  })

  it('says a block with no spends is valid', async () => {
    const block = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 3, 5)
    await blockchain.addBlock(block)
    expect((await blockchain.verifier.hasValidSpends(block)).valid).toBe(Validity.Yes)
  })

  it('says a block with valid spends is valid', async () => {
    const block1 = makeFakeBlock(strategy, blockHash(0), blockHash(1), 1, 3, 5)
    const block2 = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 6, 9)
    const nullifier = Buffer.alloc(32)
    block2.transactions[1]._spends.push({ nullifier, commitment: '1-1', size: 1 })
    await blockchain.addBlock(block1)
    await blockchain.addBlock(block2)
    expect((await blockchain.verifier.hasValidSpends(block2)).valid).toBe(Validity.Yes)
  })
  it('says a block with double spend in that block is invalid', async () => {
    const block1 = makeFakeBlock(strategy, blockHash(0), blockHash(1), 1, 3, 5)
    const block2 = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 6, 9)
    const nullifier = Buffer.alloc(32)
    await blockchain.nullifiers.add(nullifier)
    await blockchain.nullifiers.add(nullifier)
    block2.header.nullifierCommitment.commitment = await blockchain.nullifiers.rootHash()
    block2.header.nullifierCommitment.size = 3
    block2.transactions[1]._spends.push({ nullifier, commitment: '1-1', size: 1 })
    block2.transactions[2]._spends.push({ nullifier, commitment: '1-1', size: 1 })
    await blockchain.addBlock(block1)
    await blockchain.addBlock(block2)
    expect((await blockchain.verifier.hasValidSpends(block2)).valid).toBe(Validity.No)
  })
  it('says a block that spends a note spent in a previous block is invalid', async () => {
    const block1 = makeFakeBlock(strategy, blockHash(0), blockHash(1), 1, 3, 5)
    const block2 = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 6, 9)
    const nullifier = Buffer.alloc(32)
    await blockchain.nullifiers.add(nullifier)
    block1.header.nullifierCommitment.commitment = await blockchain.nullifiers.rootHash()
    block1.header.nullifierCommitment.size = 2
    await blockchain.nullifiers.add(nullifier)
    block2.header.nullifierCommitment.commitment = await blockchain.nullifiers.rootHash()
    block2.header.nullifierCommitment.size = 3
    block2.transactions[1]._spends.push({ nullifier, commitment: '1-1', size: 1 })
    block2.transactions[2]._spends.push({ nullifier, commitment: '1-1', size: 1 })
    await blockchain.addBlock(block1)
    await blockchain.addBlock(block2)
    expect((await blockchain.verifier.hasValidSpends(block2)).valid).toBe(Validity.No)
  })
  it('says a block that spends a note that was never in the tree is invalid', async () => {
    const block1 = makeFakeBlock(strategy, blockHash(0), blockHash(1), 1, 3, 5)
    const block2 = makeFakeBlock(strategy, blockHash(1), blockHash(2), 2, 6, 9)
    const nullifier = Buffer.alloc(32)
    block2.transactions[1]._spends.push({ nullifier, commitment: 'noooo', size: 1 })
    await blockchain.addBlock(block1)
    await blockchain.addBlock(block2)
    expect((await blockchain.verifier.hasValidSpends(block2)).valid).toBe(Validity.No)
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
          "valid": 0,
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
        "valid": 0,
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
        "valid": 0,
      }
    `)
  })

  it('Is invalid when the sequence is wrong', async () => {
    await blockchain.addBlock(block2)
    await blockchain.addBlock(block3)
    block3.header.sequence = BigInt(99)

    expect(blockchain.verifier.isValidAgainstPrevious(block3, block3.header))
      .toMatchInlineSnapshot(`
      Object {
        "reason": "Note commitment sizes do not match",
        "valid": 0,
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
        "valid": 0,
      }
    `)
  })
})

describe('block verification', () => {
  let strategy: TestStrategy
  let blockchain: TestBlockchain
  let targetSpy: jest.SpyInstance

  beforeEach(async () => {
    targetSpy = jest.spyOn(Target, 'minDifficulty').mockImplementation(() => BigInt(1))
    strategy = new TestStrategy(new RangeHasher())
    blockchain = await makeChainInitial(strategy)
    await blockchain.notes.add('1')
    await blockchain.nullifiers.add(Buffer.alloc(32))
  })

  afterAll(() => {
    targetSpy.mockClear()
  })
})
