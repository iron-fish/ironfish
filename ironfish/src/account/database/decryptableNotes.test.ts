/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DecryptableNotesValue, DecryptableNotesValueEncoding } from './decryptableNotes'

describe('DecryptableNotesValueEncoding', () => {
  describe('with a null note index, nullifier hash, and transaction hash', () => {
    it('serializes the object into a buffer and deserializes to the original object', () => {
      const encoder = new DecryptableNotesValueEncoding()

      const value: DecryptableNotesValue = {
        accountId: 'uuid',
        noteIndex: null,
        nullifierHash: null,
        spent: false,
        transactionHash: null,
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })

  describe('with all fields defined', () => {
    it('serializes the object into a buffer and deserializes to the original object', () => {
      const encoder = new DecryptableNotesValueEncoding()

      const value: DecryptableNotesValue = {
        accountId: 'uuid',
        spent: true,
        noteIndex: 40,
        nullifierHash: Buffer.alloc(32, 1).toString('hex'),
        transactionHash: Buffer.alloc(32, 1),
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })
})
