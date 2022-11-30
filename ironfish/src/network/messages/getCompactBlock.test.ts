/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BlockHeader, Target } from '../../primitives'
import { CompactBlock } from '../../primitives/block'
import { createNodeTest, useMinersTxFixture, useTxSpendsFixture } from '../../testUtilities'
import { expectGetCompactBlockResponseToMatch } from '../testUtilities'
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

  it('serializes the object into a buffer and deserializes to the original object', async () => {
    const { account, transaction: transactionA } = await useTxSpendsFixture(nodeTest.node)
    const transactionB = await useMinersTxFixture(nodeTest.node.wallet, account)

    const compactBlock: CompactBlock = {
      header: new BlockHeader(
        2,
        Buffer.alloc(32, 2),
        Buffer.alloc(32, 1),
        Buffer.alloc(32, 2),
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
    const rpcId = 432

    const message = new GetCompactBlockResponse(compactBlock, rpcId)
    const buffer = message.serialize()
    const deserializedMessage = GetCompactBlockResponse.deserialize(buffer, rpcId)

    expectGetCompactBlockResponseToMatch(message, deserializedMessage)
  })
})
