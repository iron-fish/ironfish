/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  useAccountFixture,
  useBlockWithTx,
  useMinersTxFixture,
} from '../testUtilities/fixtures'
import { makeBlockAfter } from '../testUtilities/helpers/blockchain'
import { createNodeTest } from '../testUtilities/nodeTest'
import { SerializedBlock } from './block'

describe('Block', () => {
  const nodeTest = createNodeTest()

  it('correctly counts notes and nullifiers', async () => {
    const accountA = await useAccountFixture(nodeTest.node.accounts, 'accountA')
    const accountB = await useAccountFixture(nodeTest.node.accounts, 'accountB')
    const { block } = await useBlockWithTx(nodeTest.node, accountA, accountB)

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

    const block = await makeBlockAfter(nodeTest.chain, nodeTest.chain.genesis)

    const serialized = nodeTest.strategy.blockSerde.serialize(block)
    expect(serialized).toMatchObject({ header: { timestamp: expect.any(Number) } })

    const deserialized = nodeTest.strategy.blockSerde.deserialize(serialized)
    expect(nodeTest.strategy.blockSerde.equals(deserialized, block)).toBe(true)
  })

  it('throws when deserializing invalid block', () => {
    const serde = nodeTest.strategy.blockSerde

    expect(() => serde.deserialize({ bad: 'data' } as unknown as SerializedBlock)).toThrowError(
      'Unable to deserialize',
    )
  })

  it('check block equality', async () => {
    const account = await useAccountFixture(nodeTest.node.accounts, 'account')
    const tx = await useMinersTxFixture(nodeTest.node.accounts, account)
    const { block: block1 } = await useBlockWithTx(nodeTest.node, account, account)

    // Header change
    const block2 = nodeTest.node.strategy.blockSerde.deserialize(
      nodeTest.node.strategy.blockSerde.serialize(block1),
    )
    expect(block1.equals(block2)).toBe(true)
    block2.header.randomness = 400
    expect(block1.equals(block2)).toBe(false)
    block2.header.randomness = block1.header.randomness
    expect(block1.equals(block2)).toBe(true)
    block2.header.sequence += 1
    expect(block1.equals(block2)).toBe(false)
    block2.header.sequence = block1.header.sequence
    expect(block1.equals(block2)).toBe(true)
    block2.header.timestamp = new Date(block2.header.timestamp.valueOf() + 1)
    expect(block1.equals(block2)).toBe(false)

    // Transactions length
    const block3 = nodeTest.node.strategy.blockSerde.deserialize(
      nodeTest.node.strategy.blockSerde.serialize(block1),
    )
    expect(block1.equals(block3)).toBe(true)
    block3.transactions.pop()
    expect(block1.equals(block3)).toBe(false)

    // Transaction equality
    const block4 = nodeTest.node.strategy.blockSerde.deserialize(
      nodeTest.node.strategy.blockSerde.serialize(block1),
    )
    expect(block1.equals(block4)).toBe(true)
    block4.transactions.pop()
    block4.transactions.push(tx)
    expect(block1.equals(block4)).toBe(false)
  }, 60000)

  it('validate get minersFee returns the first transaction in a block', async () => {
    const { block } = await useBlockWithTx(nodeTest.node)
    // Miners Fee should be the first transaction in the block
    expect(block.minersFee).toBe(block.transactions[0])
  }, 60000)

  it('validate get minersFee when no miners fee', async () => {
    nodeTest.strategy.disableMiningReward()
    const block = await makeBlockAfter(nodeTest.chain, nodeTest.chain.genesis)

    expect(() => block.minersFee).toThrowError('Block has no miners fee')
  }, 60000)
})
