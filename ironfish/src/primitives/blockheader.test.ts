/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { blake3 } from '@napi-rs/blake-hash'
import { v4 as uuid } from 'uuid'
import { createNodeTest } from '../testUtilities'
import { GraffitiUtils } from '../utils'
import {
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
  const nodeTest = createNodeTest()

  it('checks equal block headers', () => {
    const header1 = nodeTest.chain.newBlockHeaderFromRaw({
      sequence: 5,
      previousBlockHash: Buffer.alloc(32),
      noteCommitment: Buffer.alloc(32, 'header'),
      transactionCommitment: Buffer.alloc(32, 'transactionRoot'),
      target: new Target(17),
      randomness: BigInt(25),
      timestamp: new Date(1598467858637),
      graffiti: Buffer.alloc(32),
    })

    expect(header1.equals(nodeTest.chain.newBlockHeaderFromRaw({ ...header1 }))).toBe(true)

    // sequence
    expect(
      header1.equals(nodeTest.chain.newBlockHeaderFromRaw({ ...header1, sequence: 6 })),
    ).toBe(false)

    // note commitment
    expect(
      header1.equals(
        nodeTest.chain.newBlockHeaderFromRaw({
          ...header1,
          noteCommitment: Buffer.alloc(32, 'not  header'),
        }),
      ),
    ).toBe(false)

    // target
    expect(
      header1.equals(
        nodeTest.chain.newBlockHeaderFromRaw({ ...header1, target: new Target(10) }),
      ),
    ).toBe(false)

    // randomness
    expect(
      header1.equals(
        nodeTest.chain.newBlockHeaderFromRaw({ ...header1, randomness: BigInt(19) }),
      ),
    ).toBe(false)

    // timestamp
    expect(
      header1.equals(
        nodeTest.chain.newBlockHeaderFromRaw({ ...header1, timestamp: new Date(1000) }),
      ),
    ).toBe(false)

    // graffiti
    expect(
      header1.equals(
        nodeTest.chain.newBlockHeaderFromRaw({ ...header1, graffiti: Buffer.alloc(32, 'a') }),
      ),
    ).toBe(false)
  })
})

describe('BlockHeaderSerde', () => {
  const serde = BlockHeaderSerde
  const nodeTest = createNodeTest()

  it('serializes and deserializes a block header', () => {
    const header = nodeTest.chain.newBlockHeaderFromRaw({
      sequence: 5,
      previousBlockHash: Buffer.alloc(32),
      noteCommitment: Buffer.alloc(32),
      transactionCommitment: Buffer.alloc(32, 'transactionRoot'),
      target: new Target(17),
      randomness: BigInt(25),
      timestamp: new Date(1598467858637),
      graffiti: GraffitiUtils.fromString('test'),
    })

    const serialized = serde.serialize(header)
    const deserialized = serde.deserialize(serialized, nodeTest.chain)
    expect(header.equals(deserialized)).toBe(true)
  })

  it('checks block is later than', () => {
    const header1 = nodeTest.chain.newBlockHeaderFromRaw({
      sequence: 5,
      previousBlockHash: Buffer.alloc(32),
      noteCommitment: Buffer.alloc(32),
      transactionCommitment: Buffer.alloc(32, 'transactionRoot'),
      target: new Target(0),
      randomness: BigInt(0),
      timestamp: new Date(0),
      graffiti: Buffer.alloc(32),
    })

    expect(isBlockLater(header1, nodeTest.chain.newBlockHeaderFromRaw({ ...header1 }))).toBe(
      false,
    )

    expect(
      isBlockLater(
        header1,
        nodeTest.chain.newBlockHeaderFromRaw({ ...header1, sequence: header1.sequence - 1 }),
      ),
    ).toBe(true)

    const header2 = nodeTest.chain.newBlockHeaderFromRaw({
      ...header1,
      graffiti: Buffer.alloc(32, 'a'),
    })

    const header1HashIsGreater = header1.hash.compare(header2.hash) < 0
    expect(isBlockLater(header1, header2)).toBe(header1HashIsGreater)
  })

  it('checks block is heavier than', () => {
    const header1 = nodeTest.chain.newBlockHeaderFromRaw({
      sequence: 5,
      previousBlockHash: Buffer.alloc(32),
      noteCommitment: Buffer.alloc(32),
      transactionCommitment: Buffer.alloc(32, 'transactionRoot'),
      target: new Target(100),
      randomness: BigInt(0),
      timestamp: new Date(0),
      graffiti: Buffer.alloc(32),
    })

    const serialized = serde.serialize(header1)
    let header2 = serde.deserialize(serialized, nodeTest.chain)
    expect(isBlockHeavier(header1, header2)).toBe(false)

    header1.work = BigInt(1)
    header2.work = BigInt(0)
    expect(isBlockHeavier(header1, header2)).toBe(true)

    header2 = nodeTest.chain.newBlockHeaderFromRaw({
      ...header1,
      sequence: header1.sequence - 1,
    })
    header1.work = BigInt(0)
    header2.work = BigInt(0)
    expect(isBlockHeavier(header1, header2)).toBe(true)

    header2 = nodeTest.chain.newBlockHeaderFromRaw({ ...header1, target: new Target(200) })
    header1.work = BigInt(0)
    header2.work = BigInt(0)
    expect(isBlockHeavier(header1, header2)).toBe(true)

    header2 = nodeTest.chain.newBlockHeaderFromRaw({ ...header1, target: new Target(200) })
    header1.work = BigInt(0)
    header2.work = BigInt(0)

    header2 = nodeTest.chain.newBlockHeaderFromRaw({
      ...header1,
      graffiti: Buffer.alloc(32, 'a'),
    })
    const header1HashIsGreater = header1.hash.compare(header2.hash) < 0
    expect(isBlockHeavier(header1, header2)).toBe(header1HashIsGreater)
  })
})
