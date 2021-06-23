/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TestStrategy } from '../testUtilities/fake'
import { BlockHeader, BlockHeaderSerde } from './blockheader'
import { Target } from './target'

describe('Block Header Serde', () => {
  it('Compares two equivalent block headers as equal', () => {
    const strategy = new TestStrategy()
    const header1 = new BlockHeader(
      strategy,
      5,
      Buffer.alloc(32),
      { commitment: 'header', size: 8 },
      { commitment: Buffer.alloc(32), size: 3 },
      new Target(17),
      25,
      new Date(1598467858637),
      BigInt(0),
      Buffer.alloc(32),
    )
    const header2 = new BlockHeader(
      new TestStrategy(),
      5,
      Buffer.alloc(32),
      { commitment: 'header', size: 8 },
      { commitment: Buffer.alloc(32), size: 3 },
      new Target(17),
      25,
      new Date(1598467858637),
      BigInt(0),
      Buffer.alloc(32),
    )
    expect(new BlockHeaderSerde(strategy).equals(header1, header2)).toBe(true)
  })

  it('does not compare different blocks as equal', () => {
    const strategy = new TestStrategy()
    const serde = new BlockHeaderSerde(strategy)
    const header1 = new BlockHeader(
      strategy,
      5,
      Buffer.alloc(32),
      { commitment: 'header', size: 8 },
      { commitment: Buffer.alloc(32), size: 3 },
      new Target(17),
      25,
      new Date(1598467858637),
      BigInt(0),
      Buffer.alloc(32),
    )
    const header2 = new BlockHeader(
      new TestStrategy(),
      5,
      Buffer.alloc(32),
      { commitment: 'header', size: 8 },
      { commitment: Buffer.alloc(32), size: 3 },
      new Target(17),
      25,
      new Date(1598467858637),
      BigInt(0),
      Buffer.alloc(32),
    )
    header2.sequence = 6
    expect(serde.equals(header1, header2)).toBe(false)
    header2.sequence = 5
    header2.noteCommitment.commitment = 'Not header'
    expect(serde.equals(header1, header2)).toBe(false)
    header2.noteCommitment.commitment = 'header'
    header2.noteCommitment.size = 7
    expect(serde.equals(header1, header2)).toBe(false)
    header2.noteCommitment.size = 8
    header2.nullifierCommitment.commitment[0] = 8
    expect(serde.equals(header1, header2)).toBe(false)
    header2.nullifierCommitment.commitment[0] = 0
    header2.nullifierCommitment.size = 4
    expect(serde.equals(header1, header2)).toBe(false)
    header2.nullifierCommitment.size = 3
    header2.target = new Target(18)
    expect(serde.equals(header1, header2)).toBe(false)
    header2.target = new Target(17)
    header2.randomness = 24
    expect(serde.equals(header1, header2)).toBe(false)
    header2.randomness = 25
    header2.timestamp = new Date()
    expect(serde.equals(header1, header2)).toBe(false)
    header2.timestamp = new Date(1598467858637)
    expect(serde.equals(header1, header2)).toBe(true)
    header2.graffiti = Buffer.alloc(32, 'a')
    expect(serde.equals(header1, header2)).toBe(false)
    header2.graffiti = Buffer.alloc(32)
  })

  it('serializes and deserializes a block header', () => {
    const strategy = new TestStrategy()
    const serde = new BlockHeaderSerde(strategy)

    const graffiti = Buffer.alloc(32)
    graffiti.write('test')

    const header1 = new BlockHeader(
      strategy,
      5,
      Buffer.alloc(32),
      { commitment: 'header', size: 8 },
      { commitment: Buffer.alloc(32), size: 3 },
      new Target(17),
      25,
      new Date(1598467858637),
      BigInt(-1),
      graffiti,
    )
    const serialized = serde.serialize(header1)
    expect(serialized).toMatchSnapshot()
    const deserialized = serde.deserialize(serialized)
    expect(serde.equals(header1, deserialized)).toBe(true)
  })
})
