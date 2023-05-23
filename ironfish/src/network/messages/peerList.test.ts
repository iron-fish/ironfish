/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { serializePayloadToBuffer } from '../../testUtilities'
import { identityLength } from '../identity'
import { PeerListMessage } from './peerList'

describe('PeerListMessage', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const message = new PeerListMessage([
      {
        address: 'address',
        identity: Buffer.alloc(identityLength, 123),
        port: 9033,
        name: 'name',
      },
      {
        address: null,
        identity: Buffer.alloc(identityLength, 456),
        port: null,
      },
    ])

    const buffer = serializePayloadToBuffer(message)
    const deserializedMessage = PeerListMessage.deserializePayload(buffer)
    expect(deserializedMessage).toEqual(message)
  })
})
