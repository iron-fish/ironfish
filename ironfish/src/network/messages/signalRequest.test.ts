/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { serializePayloadToBuffer } from '../../testUtilities'
import { SignalRequestMessage } from './signalRequest'

describe('SignalRequestMessage', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const message = new SignalRequestMessage({
      destinationIdentity: '7stEY4c02HipHyFKrSTY6Cd8ob8SP1uJGAIuvK2EJwA=',
      sourceIdentity: '6stEY4c02HipHyFKrSTY6Cd8ob8SP1uJGAIuvK2EJwA=',
    })

    const buffer = serializePayloadToBuffer(message)
    const deserializedMessage = SignalRequestMessage.deserializePayload(buffer)
    expect(deserializedMessage).toEqual(message)
  })
})
