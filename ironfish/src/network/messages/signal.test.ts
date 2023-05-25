/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NONCE_LENGTH } from '@ironfish/rust-nodejs'
import { serializePayloadToBuffer } from '../../testUtilities'
import { SignalMessage } from './signal'

describe('SignalMessage', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const message = new SignalMessage({
      destinationIdentity: '7stEY4c02HipHyFKrSTY6Cd8ob8SP1uJGAIuvK2EJwA=',
      sourceIdentity: '6stEY4c02HipHyFKrSTY6Cd8ob8SP1uJGAIuvK2EJwA=',
      nonce: Buffer.alloc(NONCE_LENGTH, 1).toString('base64'),
      signal: Buffer.from('signal', 'utf8').toString('base64'),
    })

    const buffer = serializePayloadToBuffer(message)
    const deserializedMessage = SignalMessage.deserializePayload(buffer)
    expect(deserializedMessage).toEqual(message)
  })
})
