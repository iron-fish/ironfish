/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomBytes, randomInt } from 'crypto'
import { NewTransactionV2Message } from './newTransactionV2'

describe('NewTransactionV2Message', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const transactions = [...new Array(10)].map((_) => randomBytes(randomInt(500, 10000)))

    const message = new NewTransactionV2Message(transactions)

    const buffer = message.serialize()
    const deserializedMessage = NewTransactionV2Message.deserialize(buffer)
    expect(deserializedMessage).toEqual(message)
  })
})
