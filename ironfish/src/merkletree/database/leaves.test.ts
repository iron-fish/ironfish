/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey, Note, Transaction, TransactionPosted } from '@ironfish/rust-nodejs'
import { NoteEncrypted } from '../../primitives/noteEncrypted'
import { NoteLeafEncoding, NullifierLeafEncoding } from './leaves'

describe('NoteLeafEncoding', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const encoding = new NoteLeafEncoding()
    const key = generateKey()
    const note = new Note(key.public_address, 10n, '')
    const tx = new Transaction()
    tx.receive(key.spending_key, note)
    const buf = tx.post_miners_fee()
    const txp = new TransactionPosted(buf)
    const noteEncrypted = new NoteEncrypted(txp.getNote(0))

    const noteLeafValue = {
      element: noteEncrypted,
      merkleHash: Buffer.alloc(32, 'hashOfSibling'),
      parentIndex: 14,
    } as const

    const buffer = encoding.serialize(noteLeafValue)
    const deserializedMessage = encoding.deserialize(buffer)
    expect(deserializedMessage).toEqual(noteLeafValue)
  })
})

describe('NullifierLeafEncoding', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const encoding = new NullifierLeafEncoding()

    const nullifierLeafValue = {
      element: Buffer.alloc(32, 'element'),
      merkleHash: Buffer.alloc(32, 'hashOfSibling'),
      parentIndex: 14,
    } as const

    const buffer = encoding.serialize(nullifierLeafValue)
    const deserializedMessage = encoding.deserialize(buffer)
    expect(deserializedMessage).toEqual(nullifierLeafValue)
  })
})
