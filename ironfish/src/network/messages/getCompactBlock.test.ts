/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { SerializedCompactBlock } from '../../primitives/block'
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
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const compactBlock: SerializedCompactBlock = {
      header: {
        graffiti: Buffer.alloc(32, 'graffiti1', 'utf8').toString('hex'),
        minersFee: '0',
        noteCommitment: {
          commitment: Buffer.alloc(32, 1),
          size: 1,
        },
        nullifierCommitment: {
          commitment: Buffer.alloc(32, 2).toString('hex'),
          size: 2,
        },
        previousBlockHash: Buffer.alloc(32, 2).toString('hex'),
        randomness: '1',
        sequence: 2,
        target: '12',
        timestamp: 200000,
      },
      transactions: [
        { transaction: Buffer.from('foo'), index: 0 },
        { transaction: Buffer.from('bar'), index: 2 },
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

    expect(deserializedMessage).toEqual(message)
  })
})
