/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PeerListRequestMessage } from './peerListRequest'

describe('PeerListRequestMessage', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const message = new PeerListRequestMessage()
    const deserializedMessage = PeerListRequestMessage.deserializePayload()
    expect(deserializedMessage).toEqual(message)
  })
})
