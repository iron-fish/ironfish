/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { serializePayloadToBuffer } from '../../testUtilities'
import { NewBlockHashesMessage } from './newBlockHashes'

describe('NewBlockHashesMessage', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const message = new NewBlockHashesMessage([
      {
        hash: Buffer.alloc(32, 1),
        sequence: 1,
      },
      {
        hash: Buffer.alloc(32, 2),
        sequence: 2,
      },
    ])

    const buffer = serializePayloadToBuffer(message)
    const deserializedMessage = NewBlockHashesMessage.deserializePayload(buffer)
    expect(deserializedMessage).toEqual(message)
  })
})
