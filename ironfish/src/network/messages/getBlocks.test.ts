/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { SerializedBlock } from '../../primitives/block'
import { GetBlocksRequest, GetBlocksResponse } from './getBlocks'

describe('GetBlocksRequest', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const rpcId = 0
    const message = new GetBlocksRequest(Buffer.alloc(32), 10, rpcId)
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
            graffiti: Buffer.alloc(32, 'graffiti1', 'utf8').toString('hex'),
            minersFee: '0',
            noteCommitment: {
              commitment: Buffer.alloc(32, 4),
              size: 1,
            },
            nullifierCommitment: {
              commitment: Buffer.alloc(32, 6).toString('hex'),
              size: 2,
            },
            previousBlockHash: Buffer.alloc(32, 2).toString('hex'),
            randomness: '1',
            sequence: 2,
            target: '12',
            timestamp: 200000,
          },
          transactions: [Buffer.from('foo'), Buffer.from('bar'), Buffer.from('baz')],
        },
        {
          header: {
            graffiti: Buffer.alloc(32, 'graffiti2', 'utf8').toString('hex'),
            minersFee: '-10',
            noteCommitment: {
              commitment: Buffer.alloc(32, 5),
              size: 1,
            },
            nullifierCommitment: {
              commitment: Buffer.alloc(32, 7).toString('hex'),
              size: 2,
            },
            previousBlockHash: Buffer.alloc(32, 1).toString('hex'),
            randomness: '1',
            sequence: 2,
            target: '13',
            timestamp: 200000,
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

  it('strips optional work and hash fields when serializing', () => {
    const rpcId = 0
    const serializedBlocks: SerializedBlock[] = [
      {
        header: {
          graffiti: Buffer.alloc(32, 'graffiti1', 'utf8').toString('hex'),
          minersFee: '0',
          noteCommitment: {
            commitment: Buffer.alloc(32, 4),
            size: 1,
          },
          nullifierCommitment: {
            commitment: Buffer.alloc(32, 6).toString('hex'),
            size: 2,
          },
          previousBlockHash: Buffer.alloc(32, 2).toString('hex'),
          randomness: '1',
          sequence: 2,
          target: '12',
          timestamp: 200000,
          work: '123',
          hash: 'ramen',
        },
        transactions: [Buffer.from('foo'), Buffer.from('bar'), Buffer.from('baz')],
      },
      {
        header: {
          graffiti: Buffer.alloc(32, 'graffiti2', 'utf8').toString('hex'),
          minersFee: '-10',
          noteCommitment: {
            commitment: Buffer.alloc(32, 5),
            size: 1,
          },
          nullifierCommitment: {
            commitment: Buffer.alloc(32, 7).toString('hex'),
            size: 2,
          },
          previousBlockHash: Buffer.alloc(32, 1).toString('hex'),
          randomness: '1',
          sequence: 2,
          target: '13',
          timestamp: 200000,
          work: '123',
          hash: 'noodles',
        },
        transactions: [Buffer.from('foo'), Buffer.from('bar'), Buffer.from('baz')],
      },
    ]

    const message = new GetBlocksResponse(serializedBlocks, rpcId)
    const buffer = message.serialize()
    const deserializedMessage = GetBlocksResponse.deserialize(buffer, rpcId)

    delete serializedBlocks[0].header.hash
    delete serializedBlocks[1].header.hash
    delete serializedBlocks[0].header.work
    delete serializedBlocks[1].header.work

    expect(deserializedMessage.blocks).toEqual(serializedBlocks)
  })
})
