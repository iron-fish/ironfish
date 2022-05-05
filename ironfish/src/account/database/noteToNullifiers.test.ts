/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NoteToNullifiersValue, NoteToNullifiersValueEncoding } from './noteToNullifiers'

describe('NoteToNullifiersValueEncoding', () => {
  describe('with a null nullifier hash and index', () => {
    it('serializes the object into a buffer and deserializes to the original object', () => {
      const encoder = new NoteToNullifiersValueEncoding()

      const value: NoteToNullifiersValue = {
        spent: false,
        noteIndex: null,
        nullifierHash: null,
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })

  describe('with a null nullifier hash', () => {
    it('serializes the object into a buffer and deserializes to the original object', () => {
      const encoder = new NoteToNullifiersValueEncoding()

      const value: NoteToNullifiersValue = {
        spent: false,
        noteIndex: 40,
        nullifierHash: null,
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })

  describe('with a null note index', () => {
    it('serializes the object into a buffer and deserializes to the original object', () => {
      const encoder = new NoteToNullifiersValueEncoding()

      const value: NoteToNullifiersValue = {
        spent: false,
        noteIndex: null,
        nullifierHash: Buffer.alloc(32, 1).toString('hex'),
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })

  describe('with all fields defined', () => {
    it('serializes the object into a buffer and deserializes to the original object', () => {
      const encoder = new NoteToNullifiersValueEncoding()

      const value: NoteToNullifiersValue = {
        spent: false,
        noteIndex: 40,
        nullifierHash: Buffer.alloc(32, 1).toString('hex'),
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })
})
