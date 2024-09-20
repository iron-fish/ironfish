/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { xchacha20poly1305 } from '@ironfish/rust-nodejs'
import { MasterKeyValue, MasterKeyValueEncoding } from './masterKeyValue'

describe('MasterKeyValueEncoding', () => {
  it('serializes the value into a buffer and deserializes to the original value', () => {
    const encoder = new MasterKeyValueEncoding()

    const value: MasterKeyValue = {
      nonce: Buffer.alloc(xchacha20poly1305.XNONCE_LENGTH),
      salt: Buffer.alloc(xchacha20poly1305.XSALT_LENGTH),
    }
    const buffer = encoder.serialize(value)
    const deserializedValue = encoder.deserialize(buffer)
    expect(deserializedValue).toEqual(value)
  })
})
