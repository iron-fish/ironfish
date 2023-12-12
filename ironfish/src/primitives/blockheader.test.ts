/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { blake3 } from '@napi-rs/blake-hash'
import { v4 as uuid } from 'uuid'
import { GraffitiUtils } from '../utils'
import {
  BlockHeader,
  BlockHeaderSerde,
  isBlockHeavier,
  isBlockLater,
  NULL_NODE,
  TRANSACTION_ROOT_PERSONALIZATION,
  transactionMerkleRoot,
} from './blockheader'
import { Target } from './target'

const level = (l: number) => Buffer.concat([TRANSACTION_ROOT_PERSONALIZATION, Buffer.from([l])])

describe('transactionMerkleRoot', () => {
  it('calculates merkle root with 0 transactions', () => {
    const root = transactionMerkleRoot([])

    expect(root.equals(blake3(TRANSACTION_ROOT_PERSONALIZATION))).toBe(true)
  })

  it('calculates merkle root with 1 transaction', () => {
    const hashes = [...new Array(1)].map((_) => blake3(uuid()))
    const root = transactionMerkleRoot(hashes)

    const expectedRoot = blake3(Buffer.concat([level(0), hashes[0], NULL_NODE]))
    expect(root.equals(expectedRoot)).toBe(true)
  })

  it('calculates merkle root with 2 transactions', () => {
    const hashes = [...new Array(2)].map((_) => blake3(uuid()))
    const root = transactionMerkleRoot(hashes)

    const expectedRoot = blake3(Buffer.concat([level(0), hashes[0], hashes[1]]))
    expect(root.equals(expectedRoot)).toBe(true)
  })

  it('calculates merkle root with 3 transactions', () => {
    const hashes = [...new Array(3)].map((_) => blake3(uuid()))
    const root = transactionMerkleRoot(hashes)

    const left = blake3(Buffer.concat([level(0), hashes[0], hashes[1]]))
    const right = blake3(Buffer.concat([level(0), hashes[2], NULL_NODE]))

    const expectedRoot = blake3(Buffer.concat([level(1), left, right]))
    expect(root.equals(expectedRoot)).toBe(true)
  })

  it('calculates merkle root with 4 transactions', () => {
    const hashes = [...new Array(3)].map((_) => blake3(uuid()))
    const root = transactionMerkleRoot(hashes)

    const left = blake3(Buffer.concat([level(0), hashes[0], hashes[1]]))
    const right = blake3(Buffer.concat([level(0), hashes[2], hashes[3]]))

    const expectedRoot = blake3(Buffer.concat([level(1), left, right]))
    expect(root.equals(expectedRoot)).toBe(true)
  })

  it('calculates merkle root with 11 transactions', () => {
    const hashes = [...new Array(11)].map((_) => blake3(uuid()))
    const root = transactionMerkleRoot(hashes)

    const l1 = blake3(Buffer.concat([level(0), hashes[0], hashes[1]]))
    const r1 = blake3(Buffer.concat([level(0), hashes[2], hashes[3]]))
    const l1r1 = blake3(Buffer.concat([level(1), l1, r1]))

    const l2 = blake3(Buffer.concat([level(0), hashes[4], hashes[5]]))
    const r2 = blake3(Buffer.concat([level(0), hashes[6], hashes[7]]))
    const l2r2 = blake3(Buffer.concat([level(1), l2, r2]))

    const l3 = blake3(Buffer.concat([level(0), hashes[8], hashes[9]]))
    const r3 = blake3(Buffer.concat([level(0), hashes[10], NULL_NODE]))
    const l3r3 = blake3(Buffer.concat([level(1), l3, r3]))

    const l4 = blake3(Buffer.concat([level(0), NULL_NODE, NULL_NODE]))
    const r4 = blake3(Buffer.concat([level(0), NULL_NODE, NULL_NODE]))
    const l4r4 = blake3(Buffer.concat([level(1), l4, r4]))

    const l1r1l2r2 = blake3(Buffer.concat([level(2), l1r1, l2r2]))
    const l3r3l4r4 = blake3(Buffer.concat([level(2), l3r3, l4r4]))

    const expectedRoot = blake3(Buffer.concat([level(3), l1r1l2r2, l3r3l4r4]))
    expect(root.equals(expectedRoot)).toBe(true)
  })
})

describe('BlockHeader', () => {
  it('checks equal block headers', () => {
    const header1 = new BlockHeader(
      5,
      Buffer.alloc(32),
      Buffer.alloc(32, 'header'),
      Buffer.alloc(32, 'transactionRoot'),
      new Target(17),
      BigInt(25),
      new Date(1598467858637),
      Buffer.alloc(32),
    )

    const header2 = new BlockHeader(
      5,
      Buffer.alloc(32),
      Buffer.alloc(32, 'header'),
      Buffer.alloc(32, 'transactionRoot'),
      new Target(17),
      BigInt(25),
      new Date(1598467858637),
      Buffer.alloc(32),
    )

    expect(header1.equals(header2)).toBe(true)

    // sequence
    header2.sequence = 6
    expect(header1.equals(header2)).toBe(false)
    header2.sequence = header1.sequence
    expect(header1.equals(header2)).toBe(true)

    // note commitment
    header2.noteCommitment = Buffer.alloc(32, 'not  header')
    expect(header1.equals(header2)).toBe(false)
    header2.noteCommitment = header1.noteCommitment
    expect(header1.equals(header2)).toBe(true)

    // target
    header2.target = new Target(10)
    expect(header1.equals(header2)).toBe(false)
    header2.target = header1.target
    expect(header1.equals(header2)).toBe(true)

    // randomness
    header2.randomness = BigInt(19)
    expect(header1.equals(header2)).toBe(false)
    header2.randomness = header1.randomness
    expect(header1.equals(header2)).toBe(true)

    // timestamp
    header2.timestamp = new Date(1000)
    expect(header1.equals(header2)).toBe(false)
    header2.timestamp = header1.timestamp
    expect(header1.equals(header2)).toBe(true)

    // graffiti
    header2.graffiti = Buffer.alloc(32, 'a')
    expect(header1.equals(header2)).toBe(false)
    header2.graffiti = header1.graffiti
    expect(header1.equals(header2)).toBe(true)
  })
})

describe('BlockHeaderSerde', () => {
  const serde = BlockHeaderSerde

  it('serializes and deserializes a block header', () => {
    const header = new BlockHeader(
      5,
      Buffer.alloc(32),
      Buffer.alloc(32),
      Buffer.alloc(32, 'transactionRoot'),
      new Target(17),
      BigInt(25),
      new Date(1598467858637),
      GraffitiUtils.fromString('test'),
    )

    const serialized = serde.serialize(header)
    const deserialized = serde.deserialize(serialized)
    expect(header.equals(deserialized)).toBe(true)
  })

  it('checks block is later than', () => {
    const header1 = new BlockHeader(
      5,
      Buffer.alloc(32),
      Buffer.alloc(32),
      Buffer.alloc(32, 'transactionRoot'),
      new Target(0),
      BigInt(0),
      new Date(0),
      Buffer.alloc(32),
    )

    const serialized = serde.serialize(header1)
    const header2 = serde.deserialize(serialized)
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
      5,
      Buffer.alloc(32),
      Buffer.alloc(32),
      Buffer.alloc(32, 'transactionRoot'),
      new Target(1),
      BigInt(0),
      new Date(0),
      Buffer.alloc(32),
    )

    const serialized = serde.serialize(header1)
    const header2 = serde.deserialize(serialized)
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
