/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GetBlockHashesRequest, GetBlockHashesResponse } from './getBlockHashes'

describe('GetBlockHashesRequest', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const rpcId = 0
    const message = new GetBlockHashesRequest('123', 10, rpcId)
    const buffer = message.serialize()
    const deserializedMessage = GetBlockHashesRequest.deserialize(buffer, rpcId)
    expect(deserializedMessage).toEqual(message)
  })
})

describe('GetBlockHashesResponse', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const rpcId = 0
    const message = new GetBlockHashesResponse(['salad', 'burrito', 'croissant'], rpcId)
    const buffer = message.serialize()
    const deserializedMessage = GetBlockHashesResponse.deserialize(buffer, rpcId)
    expect(deserializedMessage).toEqual(message)
  })
})
