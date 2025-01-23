/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../../assert'
import { MnemonicEncoder } from './mnemonic'

describe('MnemonicEncoder', () => {
  describe('encoding/decoding', () => {
    it('encodes the value into a AccountImport and deserializes to the original value', () => {
      const mnemonic =
        'own bicycle nasty chaos type agent amateur inject cheese spare poverty charge ecology portion frame earn garden shed bulk youth patch sugar physical family'
      const encoder = new MnemonicEncoder()
      const decoded = encoder.decode(mnemonic, { name: 'foo' })
      Assert.isNotNull(decoded)
      const encoded = encoder.encode(decoded, { language: 'English' })
      expect(encoded).toEqual(mnemonic)
    })

    it('should throw with invalid mnemonic', () => {
      const mnemonic = 'invalid mnemonic'
      const encoder = new MnemonicEncoder()
      expect(() => encoder.decode(mnemonic, { name: 'foo' })).toThrow('Invalid mnemonic')
    })
  })
})
