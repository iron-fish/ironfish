/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Target } from '../../primitives'
import { CompactBlock } from '../../primitives/block'
import {
  createNodeTest,
  serializePayloadToBuffer,
  useMinersTxFixture,
  useTxSpendsFixture,
} from '../../testUtilities'
import { expectGetCompactBlockResponseToMatch } from '../testUtilities'
import { GetCompactBlockRequest, GetCompactBlockResponse } from './getCompactBlock'

describe('GetCompactBlockRequest', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const rpcId = 432
    const hash = Buffer.alloc(32, 1)

    const message = new GetCompactBlockRequest(hash, rpcId)
    const buffer = serializePayloadToBuffer(message)
    const deserializedMessage = GetCompactBlockRequest.deserializePayload(buffer, rpcId)

    expect(deserializedMessage).toEqual(message)
  })
})

describe('GetCompactBlockResponse', () => {
  const nodeTest = createNodeTest()

  it('serializes the object into a buffer and deserializes to the original object', async () => {
    const { account, transaction: transactionA } = await useTxSpendsFixture(nodeTest.node)
    const transactionB = await useMinersTxFixture(nodeTest.node, account)

    const compactBlock: CompactBlock = {
      header: nodeTest.chain.newBlockHeaderFromRaw({
        sequence: 2,
        previousBlockHash: Buffer.alloc(32, 2),
        noteCommitment: Buffer.alloc(32, 1),
        transactionCommitment: Buffer.alloc(32, 2),
        target: new Target(12),
        randomness: BigInt(1),
        timestamp: new Date(200000),
        graffiti: Buffer.alloc(32, 'graffiti1', 'utf8'),
      }),
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
    const buffer = serializePayloadToBuffer(message)
    const deserializedMessage = GetCompactBlockResponse.deserializePayload(buffer, rpcId)

    expectGetCompactBlockResponseToMatch(message, deserializedMessage)
  })
})
