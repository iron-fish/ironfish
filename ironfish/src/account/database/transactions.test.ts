/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { TransactionsValue, TransactionsValueEncoding } from './transactions'

describe('TransactionsValueEncoding', () => {
  describe('with a null block hash and sequence', () => {
    it('serializes the object into a buffer and deserializes to the original object', () => {
      const encoder = new TransactionsValueEncoding()

      const value: TransactionsValue = {
        transaction: Buffer.from('mock-transaction'),
        blockHash: null,
        submittedSequence: null,
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })

  describe('with a null block hash', () => {
    it('serializes the object into a buffer and deserializes to the original object', () => {
      const encoder = new TransactionsValueEncoding()

      const value: TransactionsValue = {
        transaction: Buffer.from('mock-transaction'),
        blockHash: null,
        submittedSequence: 123,
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })

  describe('with a null sequence', () => {
    it('serializes the object into a buffer and deserializes to the original object', () => {
      const encoder = new TransactionsValueEncoding()

      const value: TransactionsValue = {
        transaction: Buffer.from('mock-transaction'),
        blockHash: Buffer.alloc(32, 1).toString('hex'),
        submittedSequence: null,
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })

  describe('with all fields defined', () => {
    it('serializes the object into a buffer and deserializes to the original object', () => {
      const encoder = new TransactionsValueEncoding()

      const value: TransactionsValue = {
        transaction: Buffer.from('mock-transaction'),
        blockHash: Buffer.alloc(32, 1).toString('hex'),
        submittedSequence: 123,
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })
})
