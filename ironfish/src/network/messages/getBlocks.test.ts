/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Block, BlockHeader, Target } from '../../primitives'
import { transactionCommitment } from '../../primitives/blockheader'
import {
  createNodeTest,
  serializePayloadToBuffer,
  useMinersTxFixture,
  useTxSpendsFixture,
} from '../../testUtilities'
import { GetBlocksRequest, GetBlocksResponse } from './getBlocks'

describe('GetBlocksRequest', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const rpcId = 0
    const message = new GetBlocksRequest(Buffer.alloc(32), 10, rpcId)
    const buffer = serializePayloadToBuffer(message)
    const deserializedMessage = GetBlocksRequest.deserializePayload(buffer, rpcId)
    expect(deserializedMessage).toEqual(message)
  })
})

describe('GetBlocksResponse', () => {
  const nodeTest = createNodeTest()

  function expectGetBlocksResponseToMatch(a: GetBlocksResponse, b: GetBlocksResponse): void {
    // Test blocks separately because Block is not a primitive type
    expect(a.blocks.length).toEqual(b.blocks.length)
    a.blocks.forEach((blockA, blockIndexA) => {
      const blockB = b.blocks[blockIndexA]

      expect(blockA.equals(blockB)).toBe(true)
    })

    expect({ ...a, blocks: undefined }).toMatchObject({ ...b, blocks: undefined })
  }

  it('serializes the object into a buffer and deserializes to the original object', async () => {
    const { account, transaction: transactionA } = await useTxSpendsFixture(nodeTest.node)
    const transactionB = await useMinersTxFixture(nodeTest.node, account)

    const rpcId = 0
    const message = new GetBlocksResponse(
      [
        new Block(
          new BlockHeader(
            2,
            Buffer.alloc(32, 2),
            Buffer.alloc(32, 4),
            transactionCommitment([transactionA, transactionB]),
            new Target(12),
            BigInt(1),
            new Date(200000),
            Buffer.alloc(32, 'graffiti1', 'utf8'),
          ),
          [transactionA, transactionB],
        ),
        new Block(
          new BlockHeader(
            2,
            Buffer.alloc(32, 1),
            Buffer.alloc(32, 5),
            transactionCommitment([transactionA, transactionB]),
            new Target(13),
            BigInt(1),
            new Date(200000),
            Buffer.alloc(32, 'graffiti2', 'utf8'),
          ),
          [transactionA, transactionB],
        ),
      ],
      rpcId,
    )
    const buffer = serializePayloadToBuffer(message)
    const deserializedMessage = GetBlocksResponse.deserializePayload(buffer, rpcId)

    expectGetBlocksResponseToMatch(message, deserializedMessage)
  })
})
