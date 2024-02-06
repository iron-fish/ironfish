/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../../assert'
import { decodeAccount, encodeAccount } from './account'
import { Bech32JsonEncoder } from './bech32json'
import { AccountFormat } from './encoder'

describe('decodeAccount/encodeAccount', () => {
  describe('when decoding/encoding', () => {
    it('decodes arbitrary format without failure', () => {
      const jsonString =
        '{"version":2,"name":"ffff","spendingKey":"9e02be4c932ebc09c1eba0273a0ea41344615097222a5fb8a8787fba0db1a8fa","viewKey":"8d027bae046d73cf0be07e6024dd5719fb3bbdcac21cbb54b9850f6e4f89cd28fdb49856e5272870e497d65b177682f280938e379696dbdc689868eee5e52c1f","incomingViewKey":"348bd554fa8f1dc9686146ced3d483c48321880fc1a6cf323981bb2a41f99700","outgoingViewKey":"68543a20edaa435fb49155d1defb5141426c84d56728a8c5ae7692bc07875e3b","publicAddress":"471325ab136b883fe3dacff0f288153a9669dd4bae3d73b6578b33722a3bd22c","createdAt":{"hash":"000000000000007e3b8229e5fa28ecf70d7a34c973dd67b87160d4e55275a907","sequence":97654}}'
      const decoded = decodeAccount(jsonString)
      Assert.isNotNull(decoded)
      const encoded = encodeAccount(decoded, AccountFormat.JSON)
      expect(encoded).toEqual(jsonString)
    })

    it('renames account when option is passed', () => {
      const jsonString =
        '{"version":2,"name":"ffff","spendingKey":"9e02be4c932ebc09c1eba0273a0ea41344615097222a5fb8a8787fba0db1a8fa","viewKey":"8d027bae046d73cf0be07e6024dd5719fb3bbdcac21cbb54b9850f6e4f89cd28fdb49856e5272870e497d65b177682f280938e379696dbdc689868eee5e52c1f","incomingViewKey":"348bd554fa8f1dc9686146ced3d483c48321880fc1a6cf323981bb2a41f99700","outgoingViewKey":"68543a20edaa435fb49155d1defb5141426c84d56728a8c5ae7692bc07875e3b","publicAddress":"471325ab136b883fe3dacff0f288153a9669dd4bae3d73b6578b33722a3bd22c","createdAt":{"hash":"000000000000007e3b8229e5fa28ecf70d7a34c973dd67b87160d4e55275a907","sequence":97654}}'
      const decoded = decodeAccount(jsonString)
      Assert.isNotNull(decoded)

      const encodedJson = encodeAccount(decoded, AccountFormat.JSON)
      const decodedJson = decodeAccount(encodedJson, { name: 'new' })
      expect(decodedJson.name).toEqual('new')

      const encodedBase64 = encodeAccount(decoded, AccountFormat.Base64Json)
      const decodedBase64 = decodeAccount(encodedBase64, { name: 'new' })
      expect(decodedBase64.name).toEqual('new')

      const bech32Encoder = new Bech32JsonEncoder()
      const encodedBech32Json = bech32Encoder.encode(decoded)
      const decodedBech32Json = bech32Encoder.decode(encodedBech32Json, { name: 'new' })
      expect(decodedBech32Json.name).toEqual('new')
    })
    it('throws when json is not a valid account', () => {
      const invalidJson = '{}'
      expect(() => decodeAccount(invalidJson)).toThrow()
    })
    it('throws when name is not passed, but mnemonic is valid', () => {
      const mnemonic =
        'own bicycle nasty chaos type agent amateur inject cheese spare poverty charge ecology portion frame earn garden shed bulk youth patch sugar physical family'
      expect(() => decodeAccount(mnemonic)).toThrow(
        'Name option is required for mnemonic key encoder',
      )
    })

    it('throws when name is not passed, but spending key is valid', () => {
      const spendingKey = '9e02be4c932ebc09c1eba0273a0ea41344615097222a5fb8a8787fba0db1a8fa'
      expect(() => decodeAccount(spendingKey)).toThrow(
        'Name option is required for spending key encoder',
      )
    })
  })
})
