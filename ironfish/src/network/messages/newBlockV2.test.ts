/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BlockHeader, Target } from '../../primitives'
import { CompactBlock } from '../../primitives/block'
import { transactionCommitment } from '../../primitives/blockheader'
import { createNodeTest, useMinersTxFixture, useTxSpendsFixture } from '../../testUtilities'
import { NewBlockV2Message } from './newBlockV2'

describe('NewBlockV2Message', () => {
  const nodeTest = createNodeTest()

  function expectNewBlockV2MessageToMatch(a: NewBlockV2Message, b: NewBlockV2Message): void {
    // Test transactions separately because Transaction is not a primitive type
    expect(a.compactBlock.transactions.length).toEqual(b.compactBlock.transactions.length)
    a.compactBlock.transactions.forEach((transactionA, transactionIndexA) => {
      const transactionB = b.compactBlock.transactions[transactionIndexA]

      expect(transactionA.index).toEqual(transactionB.index)
      expect(transactionA.transaction.hash().equals(transactionB.transaction.hash())).toBe(true)
    })

    expect({ ...a.compactBlock, transactions: undefined }).toMatchObject({
      ...b.compactBlock,
      transactions: undefined,
    })
  }

  // eslint-disable-next-line jest/expect-expect
  it('serializes the object into a buffer and deserializes to the original object', async () => {
    const { account, transaction: transactionA } = await useTxSpendsFixture(nodeTest.node)
    const transactionB = await useMinersTxFixture(nodeTest.node.wallet, account)

    const compactBlock: CompactBlock = {
      header: new BlockHeader(
        2,
        Buffer.alloc(32, 2),
        Buffer.alloc(32, 1),
        {
          commitment: Buffer.alloc(32, 2),
          size: 2,
        },
        transactionCommitment([transactionA, transactionB]),
        new Target(12),
        BigInt(1),
        new Date(200000),
        Buffer.alloc(32, 'graffiti1', 'utf8'),
      ),
      transactions: [
        { transaction: transactionA, index: 0 },
        { transaction: transactionB, index: 2 },
      ],
      transactionHashes: [
        Buffer.alloc(32, 'a'),
        Buffer.alloc(32, 'b'),
        Buffer.alloc(32, 'c'),
        Buffer.alloc(32, 'd'),
      ],
    }

    const message = new NewBlockV2Message(compactBlock)
    const buffer = message.serialize()
    const deserializedMessage = NewBlockV2Message.deserialize(buffer)

    expectNewBlockV2MessageToMatch(message, deserializedMessage)
  })
})
