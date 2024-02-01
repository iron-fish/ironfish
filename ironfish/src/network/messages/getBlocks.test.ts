/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Block, Target } from '../../primitives'
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
    expect(a.serialize().equals(b.serialize())).toBe(true)
  }

  it('serializes the object into a buffer and deserializes to the original object', async () => {
    const { account, transaction: transactionA } = await useTxSpendsFixture(nodeTest.node)
    const transactionB = await useMinersTxFixture(nodeTest.node, account)

    const rpcId = 0
    const message = new GetBlocksResponse(
      [
        new Block(
          nodeTest.chain.newBlockHeaderFromRaw({
            sequence: 2,
            previousBlockHash: Buffer.alloc(32, 2),
            noteCommitment: Buffer.alloc(32, 4),
            transactionCommitment: transactionCommitment([transactionA, transactionB]),
            target: new Target(12),
            randomness: BigInt(1),
            timestamp: new Date(200000),
            graffiti: Buffer.alloc(32, 'graffiti1', 'utf8'),
          }),
          [transactionA, transactionB],
        ),
        new Block(
          nodeTest.chain.newBlockHeaderFromRaw({
            sequence: 2,
            previousBlockHash: Buffer.alloc(32, 1),
            noteCommitment: Buffer.alloc(32, 5),
            transactionCommitment: transactionCommitment([transactionA, transactionB]),
            target: new Target(13),
            randomness: BigInt(1),
            timestamp: new Date(200000),
            graffiti: Buffer.alloc(32, 'graffiti2', 'utf8'),
          }),
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
