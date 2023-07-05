/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../../assert'
import { Bech32Encoder } from './bech32'
import { Formats } from './encoder'
import { GenericEncoder } from './generic'

describe('GenericEncoder', () => {
  describe('encoding/decoding', () => {
    it('decodes arbitrary format without failure', () => {
      const jsonString =
        '{"version":2,"name":"ffff","spendingKey":"9e02be4c932ebc09c1eba0273a0ea41344615097222a5fb8a8787fba0db1a8fa","viewKey":"8d027bae046d73cf0be07e6024dd5719fb3bbdcac21cbb54b9850f6e4f89cd28fdb49856e5272870e497d65b177682f280938e379696dbdc689868eee5e52c1f","incomingViewKey":"348bd554fa8f1dc9686146ced3d483c48321880fc1a6cf323981bb2a41f99700","outgoingViewKey":"68543a20edaa435fb49155d1defb5141426c84d56728a8c5ae7692bc07875e3b","publicAddress":"471325ab136b883fe3dacff0f288153a9669dd4bae3d73b6578b33722a3bd22c","createdAt":{"hash":"000000000000007e3b8229e5fa28ecf70d7a34c973dd67b87160d4e55275a907","sequence":97654}}'
      const encoder = new GenericEncoder()
      const decoded = encoder.decode(jsonString)
      Assert.isNotNull(decoded)
      const encoded = encoder.encode(decoded, { format: Formats.JSON })
      expect(encoded).toEqual(jsonString)
    })
    it('throws when json is not a valid account', () => {
      const invalidJson = '{}'
      const encoder = new GenericEncoder()
      expect(() => encoder.decode(invalidJson, {})).toThrow()
    })

    it('defaults to bech32 encoding when no format is passed', () => {
      const jsonString =
        '{"version":2,"name":"ffff","spendingKey":"9e02be4c932ebc09c1eba0273a0ea41344615097222a5fb8a8787fba0db1a8fa","viewKey":"8d027bae046d73cf0be07e6024dd5719fb3bbdcac21cbb54b9850f6e4f89cd28fdb49856e5272870e497d65b177682f280938e379696dbdc689868eee5e52c1f","incomingViewKey":"348bd554fa8f1dc9686146ced3d483c48321880fc1a6cf323981bb2a41f99700","outgoingViewKey":"68543a20edaa435fb49155d1defb5141426c84d56728a8c5ae7692bc07875e3b","publicAddress":"471325ab136b883fe3dacff0f288153a9669dd4bae3d73b6578b33722a3bd22c","createdAt":{"hash":"000000000000007e3b8229e5fa28ecf70d7a34c973dd67b87160d4e55275a907","sequence":97654}}'
      const encoder = new GenericEncoder()
      const decoded = encoder.decode(jsonString)
      Assert.isNotNull(decoded)
      const encoded = encoder.encode(decoded)
      const bech32 = new Bech32Encoder().encode(decoded)
      expect(encoded).toEqual(bech32)
    })
  })
})
