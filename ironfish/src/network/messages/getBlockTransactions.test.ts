/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  GetBlockTransactionsRequest,
  GetBlockTransactionsResponse,
} from './getBlockTransactions'

describe('GetBlockTransactionsRequest', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const rpcId = 0
    const blockHash = Buffer.alloc(32, 1)
    const transactionIndexes = [1, 60000]

    const message = new GetBlockTransactionsRequest(blockHash, transactionIndexes, rpcId)
    const buffer = message.serialize()
    const deserializedMessage = GetBlockTransactionsRequest.deserialize(buffer, rpcId)

    expect(deserializedMessage).toEqual(message)
  })
})

describe('GetBlockTransactionsResponse', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const rpcId = 0
    const blockHash = Buffer.alloc(32, 1)
    const serializedTransactions = [
      Buffer.alloc(32, 1),
      Buffer.alloc(32, 2),
      Buffer.alloc(32, 3),
    ]

    const message = new GetBlockTransactionsResponse(blockHash, serializedTransactions, rpcId)
    const buffer = message.serialize()
    const deserializedMessage = GetBlockTransactionsResponse.deserialize(buffer, rpcId)

    expect(deserializedMessage).toEqual(message)
  })
})
