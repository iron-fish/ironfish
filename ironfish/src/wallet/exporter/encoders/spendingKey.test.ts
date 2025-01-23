/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../../assert'
import { SpendingKeyEncoder } from './spendingKey'

describe('SpendingKeyEncoder', () => {
  describe('encoding/decoding', () => {
    it('encodes the value into a AccountImport and deserializes to the original value', () => {
      const spendingKey = '9e02be4c932ebc09c1eba0273a0ea41344615097222a5fb8a8787fba0db1a8fa'
      const encoder = new SpendingKeyEncoder()
      const decoded = encoder.decode(spendingKey, { name: 'foo' })
      Assert.isNotNull(decoded)
      const encoded = encoder.encode(decoded)
      expect(encoded).toEqual(spendingKey)
    })

    it('should throw with invalid spending key', () => {
      const invalidSpendingKey = 'foo'
      const encoder = new SpendingKeyEncoder()
      expect(() => encoder.decode(invalidSpendingKey, { name: 'key' })).toThrow(
        'Invalid spending key',
      )
    })
  })
})
