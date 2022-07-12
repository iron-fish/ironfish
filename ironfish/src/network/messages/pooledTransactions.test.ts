/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { blake3 } from '@napi-rs/blake-hash'
import { randomBytes, randomInt } from 'crypto'
import { v4 as uuid } from 'uuid'
import { PooledTransactionsRequest, PooledTransactionsResponse } from './pooledTransactions'

describe('PooledTransactionsRequest', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const rpcId = 53242
    const hashes = [...Array(10)].map((_) => blake3(uuid()))

    const message = new PooledTransactionsRequest(hashes, rpcId)

    const buffer = message.serialize()
    const deserializedMessage = PooledTransactionsRequest.deserialize(buffer, rpcId)
    expect(deserializedMessage).toEqual(message)
  })
})

describe('PooledTransactionsResponse', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const rpcId = 53242
    const transactions = [...Array(100)].map((_) => randomBytes(randomInt(500, 10000)))

    const message = new PooledTransactionsResponse(transactions, rpcId)

    const buffer = message.serialize()
    const deserializedMessage = PooledTransactionsResponse.deserialize(buffer, rpcId)
    expect(deserializedMessage).toEqual(message)
  })
})
