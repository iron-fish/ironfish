/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CannotSatisfyRequest } from './cannotSatisfyRequest'

describe('CannotSatisfyRequest', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const rpcId = 0
    const message = new CannotSatisfyRequest(rpcId)
    const deserializedMessage = CannotSatisfyRequest.deserializePayload(rpcId)
    expect(deserializedMessage).toEqual(message)
  })
})
