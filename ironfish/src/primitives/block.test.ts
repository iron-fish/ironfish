/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  useAccountFixture,
  useBlockWithTx,
  useMinerBlockFixture,
  useMinersTxFixture,
} from '../testUtilities/fixtures'
import { createNodeTest } from '../testUtilities/nodeTest'
import { BlockSerde, SerializedBlock } from './block'

describe('Block', () => {
  const nodeTest = createNodeTest()

  it('correctly counts notes and nullifiers', async () => {
    const accountA = await useAccountFixture(nodeTest.node.wallet, 'accountA')
    const accountB = await useAccountFixture(nodeTest.node.wallet, 'accountB')
    const { block } = await useBlockWithTx(nodeTest.node, accountA, accountB)

    expect(block.counts()).toMatchObject({
      nullifiers: 1,
      notes: 3,
    })

    const spends = Array.from(block.spends())
    expect(spends).toHaveLength(1)

    const notes = Array.from(block.notes())
    expect(notes).toHaveLength(3)
  })

  it('serializes and deserializes a block', async () => {
    const block = await useMinerBlockFixture(nodeTest.chain)

    const serialized = BlockSerde.serialize(block)
    expect(serialized).toMatchObject({ header: { timestamp: expect.any(Number) } })

    const deserialized = BlockSerde.deserialize(serialized, nodeTest.chain)
    expect(block.equals(deserialized)).toBe(true)
  })

  it('throws when deserializing invalid block', () => {
    expect(() =>
      BlockSerde.deserialize({ bad: 'data' } as unknown as SerializedBlock, nodeTest.chain),
    ).toThrow('Unable to deserialize')
  })

  it('check block equality', async () => {
    const account = await useAccountFixture(nodeTest.node.wallet, 'account')
    const tx = await useMinersTxFixture(nodeTest.node, account)
    const { block: block1 } = await useBlockWithTx(nodeTest.node, account, account)

    // Header change
    const block2 = BlockSerde.deserialize(BlockSerde.serialize(block1), nodeTest.chain)
    expect(block1.equals(block2)).toBe(true)

    let toCompare = nodeTest.chain.newBlockFromRaw({
      header: {
        ...block2.header,
        randomness: BigInt(400),
      },
      transactions: block2.transactions,
    })
    expect(block1.equals(toCompare)).toBe(false)

    toCompare = nodeTest.chain.newBlockFromRaw({
      header: {
        ...block2.header,
        sequence: block2.header.sequence + 1,
      },
      transactions: block2.transactions,
    })
    expect(block1.equals(toCompare)).toBe(false)

    toCompare = nodeTest.chain.newBlockFromRaw({
      header: {
        ...block2.header,
        timestamp: new Date(block2.header.timestamp.valueOf() + 1),
      },
      transactions: block2.transactions,
    })
    expect(block1.equals(toCompare)).toBe(false)

    // Transactions length
    const block3 = BlockSerde.deserialize(BlockSerde.serialize(block1), nodeTest.chain)
    expect(block1.equals(block3)).toBe(true)
    block3.transactions.pop()
    expect(block1.equals(block3)).toBe(false)

    // Transaction equality
    const block4 = BlockSerde.deserialize(BlockSerde.serialize(block1), nodeTest.chain)
    expect(block1.equals(block4)).toBe(true)
    block4.transactions.pop()
    block4.transactions.push(tx)
    expect(block1.equals(block4)).toBe(false)
  })

  it('validate get minersFee returns the first transaction in a block', async () => {
    const { block } = await useBlockWithTx(nodeTest.node)
    // Miners Fee should be the first transaction in the block
    expect(block.minersFee).toBe(block.transactions[0])
  })

  it('validate get minersFee when no miners fee', async () => {
    const block = await useMinerBlockFixture(nodeTest.chain)
    block.transactions = []

    expect(() => block.minersFee).toThrow('Block has no miners fee')
  })

  it(`serializes transactions and miner's fee in compact block`, async () => {
    const { block } = await useBlockWithTx(nodeTest.node)

    const compactBlock = block.toCompactBlock()

    // The first transaction is the miners fee
    expect(compactBlock.transactions).toHaveLength(1)
    const transaction = compactBlock.transactions[0]
    expect(transaction.index).toBe(0)
    expect(transaction.transaction).toEqual(block.minersFee)

    // The remaining transactions are hashed
    const hashedTransactions = block.transactions.slice(1)

    expect(compactBlock.transactionHashes).toHaveLength(hashedTransactions.length)

    for (const [index, transaction] of hashedTransactions.entries()) {
      expect(compactBlock.transactionHashes[index]).toEqual(transaction.hash())
    }
  })
})
