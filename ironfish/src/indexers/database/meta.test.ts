/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MetaValue, MetaValueEncoding } from './meta'

describe('MetaValueEncoding', () => {
  describe('with a null value', () => {
    it('serializes the value into a buffer and deserializes to the original value', () => {
      const encoder = new MetaValueEncoding()

      const value: MetaValue = null
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })

  describe('with a defined value', () => {
    it('serializes the value into a buffer and deserializes to the original value', () => {
      const encoder = new MetaValueEncoding()

      const value: MetaValue = Buffer.alloc(32, 0).toString('hex')
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })
})
