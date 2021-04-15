/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  TestStrategy,
  makeFakeBlock,
  blockHash,
  makeBlockWithTransaction,
  makeBlockAfter,
} from '../captain/testUtilities'
import { createNodeTest } from '../testUtilities/nodeTest'
import { BlockSerde } from './block'
import { useAccountFixture } from '../testUtilities/fixtures'
import { SerializedIronfishBlock } from '../strategy'

describe('Block', () => {
  const nodeTest = createNodeTest()

  it('correctly counts notes and nullifiers', async () => {
    await nodeTest.node.seed()

    const accountA = await useAccountFixture(nodeTest.node.accounts, 'accountA')
    const accountB = await useAccountFixture(nodeTest.node.accounts, 'accountB')
    const block = await makeBlockWithTransaction(nodeTest.node, accountA, accountB)

    expect(block.counts()).toMatchObject({
      nullifiers: 1,
      notes: 3,
    })

    const spends = Array.from(block.spends())
    expect(spends).toHaveLength(1)

    const notes = Array.from(block.allNotes())
    expect(notes).toHaveLength(3)
  }, 60000)

  it('serializes and deserializes a block', async () => {
    nodeTest.strategy.disableMiningReward()

    const genesis = await nodeTest.node.seed()
    const block = await makeBlockAfter(nodeTest.captain.chain, genesis)

    const serialized = nodeTest.captain.blockSerde.serialize(block)
    expect(serialized).toMatchObject({ header: { timestamp: expect.any(Number) } })

    const deserialized = nodeTest.captain.blockSerde.deserialize(serialized)
    expect(nodeTest.captain.blockSerde.equals(deserialized, block)).toBe(true)
  })

  it('throws when deserializing invalid block', () => {
    const serde = nodeTest.captain.blockSerde

    expect(() =>
      serde.deserialize(({ bad: 'data' } as unknown) as SerializedIronfishBlock),
    ).toThrowError('Unable to deserialize')
  })

  it('check block equality', () => {
    const strategy = new TestStrategy()
    const serde = new BlockSerde(strategy)

    const block1 = makeFakeBlock(strategy, blockHash(4), blockHash(5), 5, 5, 9)
    const block2 = makeFakeBlock(strategy, blockHash(4), blockHash(5), 5, 5, 9)

    block2.header.timestamp = block1.header.timestamp
    expect(serde.equals(block1, block2)).toBe(true)

    block2.header.randomness = 400
    expect(serde.equals(block1, block2)).toBe(false)

    const block3 = makeFakeBlock(strategy, blockHash(4), blockHash(5), 5, 5, 8)
    block3.header.timestamp = block1.header.timestamp
    expect(serde.equals(block1, block3)).toBe(false)

    const block4 = makeFakeBlock(strategy, blockHash(4), blockHash(5), 5, 5, 9)
    block4.header.timestamp = block1.header.timestamp
    block4.transactions[0].totalFees = BigInt(999)
    expect(serde.equals(block1, block4)).toBe(false)
  })
})
