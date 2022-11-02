/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BlockHeader, Target } from '../../primitives'
import { CompactBlock } from '../../primitives/block'
import { createNodeTest, useTxSpendsFixture } from '../../testUtilities'
import { GetCompactBlockRequest, GetCompactBlockResponse } from './getCompactBlock'

describe('GetCompactBlockRequest', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const rpcId = 432
    const hash = Buffer.alloc(32, 1)

    const message = new GetCompactBlockRequest(hash, rpcId)
    const buffer = message.serialize()
    const deserializedMessage = GetCompactBlockRequest.deserialize(buffer, rpcId)

    expect(deserializedMessage).toEqual(message)
  })
})

describe('GetCompactBlockResponse', () => {
  const nodeTest = createNodeTest()

  function expectGetCompactBlockResponseToMatch(
    a: GetCompactBlockResponse,
    b: GetCompactBlockResponse,
  ): void {
    // Test transaction separately because it's not a primitive type
    expect(a.compactBlock.transactions.length).toEqual(b.compactBlock.transactions.length)
    a.compactBlock.transactions.forEach((transactionA, transactionIndexA) => {
      const transactionB = b.compactBlock.transactions[transactionIndexA]

      expect(transactionA.index).toEqual(transactionB.index)
      expect(transactionA.transaction.hash().equals(transactionB.transaction.hash())).toBe(true)
    })

    expect({
      ...a,
      compactBlock: { ...a.compactBlock, transactions: undefined },
    }).toMatchObject({ ...b, compactBlock: { ...b.compactBlock, transactions: undefined } })
  }

  // eslint-disable-next-line jest/expect-expect
  it('serializes the object into a buffer and deserializes to the original object', async () => {
    const { transaction } = await useTxSpendsFixture(nodeTest.node)

    const compactBlock: CompactBlock = {
      header: new BlockHeader(
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
      transactions: [
        { transaction: transaction, index: 0 },
        { transaction: transaction, index: 2 },
      ],
      transactionHashes: [
        Buffer.alloc(32, 'a'),
        Buffer.alloc(32, 'b'),
        Buffer.alloc(32, 'c'),
        Buffer.alloc(32, 'd'),
      ],
    }
    const rpcId = 432

    const message = new GetCompactBlockResponse(compactBlock, rpcId)
    const buffer = message.serialize()
    const deserializedMessage = GetCompactBlockResponse.deserialize(buffer, rpcId)

    expectGetCompactBlockResponseToMatch(message, deserializedMessage)
  })
})
