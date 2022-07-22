/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NewTransactionMessage } from './newTransaction'

describe('NewTransaction', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const nonce = Buffer.alloc(16, 1)
    const message = new NewTransactionMessage(Buffer.from('asdf'), nonce)
    const deserializedMessage = NewTransactionMessage.deserialize(message.serialize(), nonce)
    expect(deserializedMessage).toEqual(message)
  })
})
