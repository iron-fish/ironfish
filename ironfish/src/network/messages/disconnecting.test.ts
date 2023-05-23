/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { serializePayloadToBuffer } from '../../testUtilities'
import { identityLength } from '../identity'
import { DisconnectingMessage, DisconnectingReason } from './disconnecting'

describe('DisconnectingMessage', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const message = new DisconnectingMessage({
      destinationIdentity: null,
      disconnectUntil: 1000,
      reason: DisconnectingReason.Congested,
      sourceIdentity: Buffer.alloc(identityLength, 123).toString('base64'),
    })

    const buffer = serializePayloadToBuffer(message)
    const deserializedMessage = DisconnectingMessage.deserializePayload(buffer)
    expect(deserializedMessage).toEqual(message)
  })

  it('converts millisecond precision to second precision when serializing the message', () => {
    const message = new DisconnectingMessage({
      destinationIdentity: null,
      disconnectUntil: 1649968932977,
      reason: DisconnectingReason.Congested,
      sourceIdentity: Buffer.alloc(identityLength, 123).toString('base64'),
    })

    const buffer = serializePayloadToBuffer(message)
    const deserializedMessage = DisconnectingMessage.deserializePayload(buffer)
    expect(deserializedMessage.disconnectUntil).toEqual(1649968933000)
  })
})
