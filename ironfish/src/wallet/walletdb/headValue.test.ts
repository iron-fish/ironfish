/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { HeadValue, NullableHeadValueEncoding } from './headValue'

describe('HeadValueEncoding', () => {
  describe('with a defined value', () => {
    it('serializes the value into a buffer and deserializes to the original value', () => {
      const encoder = new NullableHeadValueEncoding()

      const value: HeadValue = {
        hash: Buffer.alloc(32),
        sequence: 0,
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })

  describe('with a null value', () => {
    it('serializes the value into a buffer and deserializes to the original value', () => {
      const encoder = new NullableHeadValueEncoding()

      const value = null
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })
})
