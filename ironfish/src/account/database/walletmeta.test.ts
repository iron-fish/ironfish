/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { WalletDBMetaValue, WalletDBMetaValueEncoding } from './walletmeta'

describe('WalletDBMetaValueEncoding', () => {
  describe('with an empty head hash map', () => {
    it('serializes the object into a buffer and deserializes to the original object', () => {
      const encoder = new WalletDBMetaValueEncoding()

      const value: WalletDBMetaValue = {
        defaultAccountId: 0,
        headHashes: new Map(),
      }

      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })

  describe('with all fields defined', () => {
    it('serializes the object into a buffer and deserializes to the original object', () => {
      const encoder = new WalletDBMetaValueEncoding()

      const value: WalletDBMetaValue = {
        defaultAccountId: 0,
        headHashes: new Map([
          [0, Buffer.alloc(32, 1).toString('hex')],
          [1, Buffer.alloc(32, 1).toString('hex')],
          [4, Buffer.alloc(32, 'a').toString('hex')],
        ]),
      }

      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })
})
