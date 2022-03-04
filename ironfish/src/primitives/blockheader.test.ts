/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createNodeTest } from '../testUtilities/nodeTest'
import { GraffitiUtils } from '../utils'
import { BlockHeader, isBlockHeavier, isBlockLater } from './blockheader'
import { Target } from './target'

describe('BlockHeaderSerde', () => {
  const nodeTest = createNodeTest()

  it('checks equal block headers', () => {
    const { strategy } = nodeTest
    const serde = strategy.blockHeaderSerde

    const header1 = new BlockHeader(
      strategy,
      5,
      Buffer.alloc(32),
      { commitment: Buffer.alloc(32, 'header'), size: 8 },
      { commitment: Buffer.alloc(32), size: 3 },
      new Target(17),
      25,
      new Date(1598467858637),
      BigInt(0),
      Buffer.alloc(32),
    )

    const header2 = new BlockHeader(
      strategy,
      5,
      Buffer.alloc(32),
      { commitment: Buffer.alloc(32, 'header'), size: 8 },
      { commitment: Buffer.alloc(32), size: 3 },
      new Target(17),
      25,
      new Date(1598467858637),
      BigInt(0),
      Buffer.alloc(32),
    )

    expect(serde.equals(header1, header2)).toBe(true)

    // sequence
    header2.sequence = 6
    expect(serde.equals(header1, header2)).toBe(false)
    header2.sequence = header1.sequence
    expect(serde.equals(header1, header2)).toBe(true)

    // note commitment
    header2.noteCommitment.commitment = Buffer.alloc(32, 'not  header')
    expect(serde.equals(header1, header2)).toBe(false)
    header2.noteCommitment.commitment = header1.noteCommitment.commitment
    expect(serde.equals(header1, header2)).toBe(true)

    // note size
    header2.noteCommitment.size = 7
    expect(serde.equals(header1, header2)).toBe(false)
    header2.noteCommitment.size = header1.noteCommitment.size
    expect(serde.equals(header1, header2)).toBe(true)

    // nullifier commitment
    header2.nullifierCommitment.commitment = Buffer.alloc(32, 'not  header')
    expect(serde.equals(header1, header2)).toBe(false)
    header2.nullifierCommitment.commitment = header1.nullifierCommitment.commitment
    expect(serde.equals(header1, header2)).toBe(true)

    // nullifier size
    header2.nullifierCommitment.size = 7
    expect(serde.equals(header1, header2)).toBe(false)
    header2.nullifierCommitment.size = header1.nullifierCommitment.size
    expect(serde.equals(header1, header2)).toBe(true)

    // target
    header2.target = new Target(10)
    expect(serde.equals(header1, header2)).toBe(false)
    header2.target = header1.target
    expect(serde.equals(header1, header2)).toBe(true)

    // randomness
    header2.randomness = 19
    expect(serde.equals(header1, header2)).toBe(false)
    header2.randomness = header1.randomness
    expect(serde.equals(header1, header2)).toBe(true)

    // timestamp
    header2.timestamp = new Date(1000)
    expect(serde.equals(header1, header2)).toBe(false)
    header2.timestamp = header1.timestamp
    expect(serde.equals(header1, header2)).toBe(true)

    // graffiti
    header2.graffiti = Buffer.alloc(32, 'a')
    expect(serde.equals(header1, header2)).toBe(false)
    header2.graffiti = header1.graffiti
    expect(serde.equals(header1, header2)).toBe(true)
  })

  it('serializes and deserializes a block header', () => {
    const { strategy } = nodeTest
    const serde = strategy.blockHeaderSerde

    const header = new BlockHeader(
      strategy,
      5,
      Buffer.alloc(32),
      { commitment: Buffer.alloc(32), size: 8 },
      { commitment: Buffer.alloc(32), size: 3 },
      new Target(17),
      25,
      new Date(1598467858637),
      BigInt(-1),
      GraffitiUtils.fromString('test'),
    )

    const serialized = serde.serialize(header)
    const deserialized = serde.deserialize(serialized)
    expect(serde.equals(header, deserialized)).toBe(true)
  })

  it('checks block is later than', () => {
    const header1 = new BlockHeader(
      nodeTest.strategy,
      5,
      Buffer.alloc(32),
      { commitment: Buffer.alloc(32), size: 0 },
      { commitment: Buffer.alloc(32), size: 0 },
      new Target(0),
      0,
      new Date(0),
      BigInt(0),
      Buffer.alloc(32),
    )

    const serialized = nodeTest.strategy.blockHeaderSerde.serialize(header1)
    const header2 = nodeTest.strategy.blockHeaderSerde.deserialize(serialized)
    expect(isBlockLater(header1, header2)).toBe(false)

    header1.sequence = 6
    header2.sequence = 5
    expect(isBlockLater(header1, header2)).toBe(true)

    header1.sequence = 5
    header2.sequence = 5
    header1.hash = Buffer.alloc(32, 1)
    header2.hash = Buffer.alloc(32, 2)
    expect(isBlockLater(header1, header2)).toBe(true)
  })

  it('checks block is heavier than', () => {
    const header1 = new BlockHeader(
      nodeTest.strategy,
      5,
      Buffer.alloc(32),
      { commitment: Buffer.alloc(32), size: 0 },
      { commitment: Buffer.alloc(32), size: 0 },
      new Target(1),
      0,
      new Date(0),
      BigInt(0),
      Buffer.alloc(32),
    )

    const serialized = nodeTest.strategy.blockHeaderSerde.serialize(header1)
    const header2 = nodeTest.strategy.blockHeaderSerde.deserialize(serialized)
    expect(isBlockHeavier(header1, header2)).toBe(false)

    header1.work = BigInt(1)
    header2.work = BigInt(0)
    header1.sequence = 5
    header2.sequence = 5
    header1.target = new Target(100)
    header2.target = new Target(100)
    header1.hash = Buffer.alloc(32, 0)
    header1.hash = Buffer.alloc(32, 0)
    expect(isBlockHeavier(header1, header2)).toBe(true)

    header1.work = BigInt(0)
    header2.work = BigInt(0)
    header1.sequence = 6
    header2.sequence = 5
    header1.target = new Target(100)
    header2.target = new Target(100)
    header1.hash = Buffer.alloc(32, 0)
    header1.hash = Buffer.alloc(32, 0)
    expect(isBlockHeavier(header1, header2)).toBe(true)

    header1.work = BigInt(0)
    header2.work = BigInt(0)
    header1.sequence = 5
    header2.sequence = 5
    header1.target = new Target(100)
    header2.target = new Target(200)
    header1.hash = Buffer.alloc(32, 0)
    header1.hash = Buffer.alloc(32, 0)
    expect(isBlockHeavier(header1, header2)).toBe(true)

    header1.work = BigInt(0)
    header2.work = BigInt(0)
    header1.sequence = 5
    header2.sequence = 5
    header1.target = new Target(100)
    header2.target = new Target(100)
    header1.hash = Buffer.alloc(32, 0)
    header2.hash = Buffer.alloc(32, 1)
    expect(isBlockHeavier(header1, header2)).toBe(true)
  })
})
