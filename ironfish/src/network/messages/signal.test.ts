/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { nonceLength } from '../peers/encryption'
import { SignalMessage } from './signal'

describe('SignalMessage', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const message = new SignalMessage({
      destinationIdentity: '7stEY4c02HipHyFKrSTY6Cd8ob8SP1uJGAIuvK2EJwA=',
      sourceIdentity: '6stEY4c02HipHyFKrSTY6Cd8ob8SP1uJGAIuvK2EJwA=',
      nonce: Buffer.alloc(nonceLength, 1).toString('base64'),
      signal: Buffer.from('signal', 'utf8').toString('base64'),
    })

    const buffer = message.serialize()
    const deserializedMessage = SignalMessage.deserialize(buffer)
    expect(deserializedMessage).toEqual(message)
  })
})
