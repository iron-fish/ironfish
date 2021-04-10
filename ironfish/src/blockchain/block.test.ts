/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  TestTransaction,
  TestStrategy,
  SerializedTestTransaction,
  makeFakeBlock,
  blockHash,
} from '../captain/testUtilities'
import Block, { BlockSerde, SerializedBlock } from './block'

describe('Block', () => {
  const strategy = new TestStrategy()
  let block: Block<string, string, TestTransaction, string, string, SerializedTestTransaction>

  beforeEach(() => {
    block = makeFakeBlock(strategy, blockHash(4), blockHash(5), 5, 5, 9)
  })

  it('correctly counts notes and nullifiers', () => {
    block.transactions[1]._spends.push({
      nullifier: Buffer.alloc(32),
      commitment: 'Spent',
      size: 1,
    })
    expect(block.counts()).toMatchInlineSnapshot(`
      Object {
        "notes": 5,
        "nullifiers": 1,
      }
    `)
  })

  it('serializes and deserializes a block', () => {
    const serde = new BlockSerde(strategy)
    const serialized = serde.serialize(block)
    expect(serialized).toMatchSnapshot({ header: { timestamp: expect.any(Number) } })
    const deserialized = serde.deserialize(serialized)
    expect(serde.equals(deserialized, block)).toBe(true)
  })

  it('throws when deserializing invalid data', () => {
    const serde = new BlockSerde(strategy)
    expect(() =>
      serde.deserialize(({ bad: 'data' } as unknown) as SerializedBlock<
        string,
        SerializedTestTransaction<string>
      >),
    ).toThrowErrorMatchingInlineSnapshot(`"Unable to deserialize"`)
  })

  it('does not compare unequal blocks as equal', () => {
    const serde = new BlockSerde(strategy)
    const block2 = makeFakeBlock(strategy, blockHash(4), blockHash(5), 5, 5, 9)
    block2.header.timestamp = block.header.timestamp
    expect(serde.equals(block, block2)).toBe(true)

    block2.header.randomness = 400
    expect(serde.equals(block, block2)).toBe(false)

    const block3 = makeFakeBlock(strategy, blockHash(4), blockHash(5), 5, 5, 8)
    block3.header.timestamp = block.header.timestamp
    expect(serde.equals(block, block3)).toBe(false)

    const block4 = makeFakeBlock(strategy, blockHash(4), blockHash(5), 5, 5, 9)
    block4.header.timestamp = block.header.timestamp
    block4.transactions[0].totalFees = BigInt(999)
    expect(serde.equals(block, block4)).toBe(false)
  })

  it('iterates over spends', () => {
    block.transactions = [
      new TestTransaction(true, ['one', 'two'], 5, [
        { nullifier: Buffer.alloc(32), commitment: 'One', size: 1 },
      ]),
      new TestTransaction(true, ['three', 'four'], 5, [
        { nullifier: Buffer.alloc(32), commitment: 'Two', size: 1 },
      ]),
    ]
    const spends = Array.from(block.spends())
    expect(spends).toHaveLength(2)
  })

  it('iterates over notes', () => {
    const notes = Array.from(block.allNotes())
    expect(notes).toHaveLength(5)
  })
})
