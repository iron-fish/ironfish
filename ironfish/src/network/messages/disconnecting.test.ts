/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DisconnectingMessage, DisconnectingReason } from './disconnecting'

describe('DisconnectingMessage', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const message = new DisconnectingMessage({
      destinationIdentity: null,
      disconnectUntil: 123,
      reason: DisconnectingReason.Congested,
      sourceIdentity: 'source',
    })

    const buffer = message.serialize()
    const deserializedMessage = DisconnectingMessage.deserialize(buffer)
    expect(deserializedMessage).toEqual(message)
  })
})
