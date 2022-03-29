/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { SignalMessage } from './signal'

describe('SignalMessage', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const message = new SignalMessage({
      destinationIdentity: 'destination',
      sourceIdentity: 'source',
      nonce: 'nonce',
      signal: 'signal',
    })

    const buffer = message.serialize()
    const deserializedMessage = SignalMessage.deserialize(buffer)
    expect(deserializedMessage).toEqual(message)
  })
})
