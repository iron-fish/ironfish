/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GetBlocksRequest, GetBlocksResponse } from './getBlocks'

describe('GetBlocksRequest', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const rpcId = 0
    const message = new GetBlocksRequest('123', 10, rpcId)
    const buffer = message.serialize()
    const deserializedMessage = GetBlocksRequest.deserialize(buffer, rpcId)
    expect(deserializedMessage).toEqual(message)
  })
})

describe('GetBlocksResponse', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const rpcId = 0
    const message = new GetBlocksResponse(
      [
        {
          header: {
            graffiti: 'chipotle',
            minersFee: '0',
            noteCommitment: {
              commitment: Buffer.from('commitment'),
              size: 1,
            },
            nullifierCommitment: {
              commitment: 'commitment',
              size: 2,
            },
            previousBlockHash: 'burrito',
            randomness: 1,
            sequence: 2,
            target: 'icecream',
            timestamp: 200000,
            work: '123',
            hash: 'ramen',
          },
          transactions: [Buffer.from('foo'), Buffer.from('bar'), Buffer.from('baz')],
        },
        {
          header: {
            graffiti: 'sweetgreen',
            minersFee: '10',
            noteCommitment: {
              commitment: Buffer.from('pizza'),
              size: 1,
            },
            nullifierCommitment: {
              commitment: 'sandwich',
              size: 2,
            },
            previousBlockHash: 'guacamole',
            randomness: 1,
            sequence: 2,
            target: 'coffee',
            timestamp: 200000,
            work: '123',
            hash: 'noodles',
          },
          transactions: [Buffer.from('foo'), Buffer.from('bar'), Buffer.from('baz')],
        },
      ],
      rpcId,
    )
    const buffer = message.serialize()
    const deserializedMessage = GetBlocksResponse.deserialize(buffer, rpcId)
    expect(deserializedMessage).toEqual(message)
  })
})
