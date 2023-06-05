/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  createNodeTest,
  serializePayloadToBuffer,
  useMinerBlockFixture,
} from '../../testUtilities'
import { expectGetBlockHeadersResponseToMatch } from '../testUtilities'
import { GetBlockHeadersRequest, GetBlockHeadersResponse } from './getBlockHeaders'

describe('GetBlockHeadersRequest', () => {
  describe('start as sequence', () => {
    it('serializes the object into a buffer and deserializes to the original object', () => {
      const rpcId = 0
      const message = new GetBlockHeadersRequest(1, 10, 0, false, rpcId)

      const buffer = serializePayloadToBuffer(message)
      const deserializedMessage = GetBlockHeadersRequest.deserializePayload(buffer, rpcId)
      expect(deserializedMessage).toEqual(message)
    })
  })

  describe('start as block hash', () => {
    it('serializes the object into a buffer and deserializes to the original object', () => {
      const rpcId = 0
      const message = new GetBlockHeadersRequest(Buffer.alloc(32, 1), 10, 0, false, rpcId)

      const buffer = serializePayloadToBuffer(message)
      const deserializedMessage = GetBlockHeadersRequest.deserializePayload(buffer, rpcId)
      expect(deserializedMessage).toEqual(message)
    })
  })
})

describe('GetBlockHeadersResponse', () => {
  const nodeTest = createNodeTest()

  it('serializes the object into a buffer and deserializes to the original object', async () => {
    const block1 = await useMinerBlockFixture(nodeTest.chain, 1)
    const block2 = await useMinerBlockFixture(nodeTest.chain, 2)

    const rpcId = 0
    const message = new GetBlockHeadersResponse([block1.header, block2.header], rpcId)

    const buffer = serializePayloadToBuffer(message)
    const deserializedMessage = GetBlockHeadersResponse.deserializePayload(buffer, rpcId)
    expectGetBlockHeadersResponseToMatch(deserializedMessage, message)
  })

  it('throws if the given length does not match the number of hashes', async () => {
    const block1 = await useMinerBlockFixture(nodeTest.chain, 1)
    const block2 = await useMinerBlockFixture(nodeTest.chain, 2)

    const rpcId = 0
    const message = new GetBlockHeadersResponse([block1.header, block2.header], rpcId)

    const buffer = serializePayloadToBuffer(message)
    buffer.writeUInt16LE(3, 0)
    expect(() => GetBlockHeadersResponse.deserializePayload(buffer, rpcId)).toThrow()
  })
})
