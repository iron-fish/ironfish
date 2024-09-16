/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { xchacha20poly1305 } from '@ironfish/rust-nodejs'
import { MasterKeyValue, NullableMasterKeyValueEncoding } from './masterKeyValue'

describe('MasterKeyValueEncoding', () => {
  describe('with a defined value', () => {
    it('serializes the value into a buffer and deserializes to the original value', () => {
      const encoder = new NullableMasterKeyValueEncoding()

      const value: MasterKeyValue = {
        nonce: Buffer.alloc(xchacha20poly1305.XNONCE_LENGTH),
        salt: Buffer.alloc(xchacha20poly1305.XSALT_LENGTH),
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })

  describe('with a null value', () => {
    it('serializes the value into a buffer and deserializes to the original value', () => {
      const encoder = new NullableMasterKeyValueEncoding()

      const value = null
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })
})
