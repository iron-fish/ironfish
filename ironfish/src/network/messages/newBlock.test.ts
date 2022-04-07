/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NewBlockMessage } from './newBlock'

describe('NewBlocksMessage', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const nonce = 'nonce'
    const message = new NewBlockMessage(
      {
        header: {
          graffiti: 'chipotle',
          minersFee: '0',
          noteCommitment: {
            commitment: Buffer.from('commitment'),
            size: 1,
          },
          nullifierCommitment: {
            commitment: 'commitment',
            size: 2,
          },
          previousBlockHash: 'burrito',
          randomness: 1,
          sequence: 2,
          target: 'icecream',
          timestamp: 200000,
          work: '123',
          hash: 'ramen',
        },
        transactions: [Buffer.from('foo'), Buffer.from('bar'), Buffer.from('baz')],
      },
      nonce,
    )
    const buffer = message.serialize()
    const deserializedMessage = NewBlockMessage.deserialize(buffer, nonce)
    expect(deserializedMessage).toEqual(message)
  })
})
