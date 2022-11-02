/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Block, BlockHeader, Target } from '../../primitives'
import { createNodeTest, useTxSpendsFixture } from '../../testUtilities'
import { NewBlockMessage } from './newBlock'

describe('NewBlocksMessage', () => {
  const nodeTest = createNodeTest()

  function expectNewBlockMessageToMatch(a: NewBlockMessage, b: NewBlockMessage): void {
    // Test transaction separately because it's not a primitive type
    expect(a.block.transactions.length).toEqual(b.block.transactions.length)
    a.block.transactions.forEach((transactionA, transactionIndexA) => {
      const transactionB = b.block.transactions[transactionIndexA]

      expect(transactionA.hash().equals(transactionB.hash())).toBe(true)
    })

    expect({ ...a, transactions: undefined }).toMatchObject({
      ...b,
      transactions: undefined,
    })
  }

  // eslint-disable-next-line jest/expect-expect
  it('serializes the object into a buffer and deserializes to the original object', async () => {
    const { transaction } = await useTxSpendsFixture(nodeTest.node)

    const nonce = Buffer.alloc(16, 2)
    const message = new NewBlockMessage(
      new Block(
        new BlockHeader(
          2,
          Buffer.alloc(32, 2),
          {
            commitment: Buffer.alloc(32, 1),
            size: 1,
          },
          {
            commitment: Buffer.alloc(32, 2),
            size: 2,
          },
          new Target(12),
          BigInt(1),
          new Date(200000),
          BigInt(0),
          Buffer.alloc(32, 'graffiti1', 'utf8'),
        ),
        [transaction, transaction, transaction],
      ),
      nonce,
    )
    const buffer = message.serialize()
    const deserializedMessage = NewBlockMessage.deserialize(buffer, nonce)

    expectNewBlockMessageToMatch(message, deserializedMessage)
  })
})
