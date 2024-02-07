/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateKey } from '@ironfish/rust-nodejs'
import { Assert } from '../../../assert'
import { AccountImport } from '../../walletdb/accountValue'
import { ACCOUNT_SCHEMA_VERSION } from '../account'
import { JsonEncoder } from './json'
describe('JsonEncoder', () => {
  describe('encoding/decoding', () => {
    it('encodes the value into a AccountImport and deserializes to the original value', () => {
      const jsonString =
        '{"version":2,"name":"ffff","spendingKey":"9e02be4c932ebc09c1eba0273a0ea41344615097222a5fb8a8787fba0db1a8fa","viewKey":"8d027bae046d73cf0be07e6024dd5719fb3bbdcac21cbb54b9850f6e4f89cd28fdb49856e5272870e497d65b177682f280938e379696dbdc689868eee5e52c1f","incomingViewKey":"348bd554fa8f1dc9686146ced3d483c48321880fc1a6cf323981bb2a41f99700","outgoingViewKey":"68543a20edaa435fb49155d1defb5141426c84d56728a8c5ae7692bc07875e3b","publicAddress":"471325ab136b883fe3dacff0f288153a9669dd4bae3d73b6578b33722a3bd22c","createdAt":{"hash":"000000000000007e3b8229e5fa28ecf70d7a34c973dd67b87160d4e55275a907","sequence":97654}}'
      const encoder = new JsonEncoder()
      const decoded = encoder.decode(jsonString)
      Assert.isNotNull(decoded)
      const encoded = encoder.encode(decoded)
      expect(encoded).toEqual(jsonString)
    })

    it('throws when json is not a valid account', () => {
      const invalidJson = '{}'
      const encoder = new JsonEncoder()
      expect(() => encoder.decode(invalidJson)).toThrow()
    })

    it('derives missing viewKeys from the spendingKey', () => {
      const jsonString =
        '{"id":"b7f1a89e-225e-44d1-8b49-90439cc2d467","name":"test","spendingKey":"6abe8ea63993915ee7603a4bbc3e5fcbef339a96ddd2432476664d76e208e9ee","incomingViewKey":"a43af622cfe11d0e1619f88fe3160a1ec14079b8e525920d405362756bc6c904","outgoingViewKey":"5a0a1e01d31ed0be06732cbf9735ec6d6ce8c31beb833569f55a1b44e64aa3b7","publicAddress":"c121b2b9c39a6613ea04c960a8a4b942ebf8ad366df853c5b97f3cc09c51b502"}'
      const encoder = new JsonEncoder()
      const decoded = encoder.decode(jsonString)
      Assert.isNotNull(decoded)
      expect(decoded.viewKey).not.toBeNull()
    })

    it('encodes and decodes accounts with multisig coordinator keys', () => {
      const key = generateKey()

      const accountImport: AccountImport = {
        version: ACCOUNT_SCHEMA_VERSION,
        name: 'test',
        spendingKey: null,
        viewKey: key.viewKey,
        incomingViewKey: key.incomingViewKey,
        outgoingViewKey: key.outgoingViewKey,
        publicAddress: key.publicAddress,
        createdAt: null,
        multisigKeys: {
          publicKeyPackage: 'cccc',
        },
        proofAuthorizingKey: key.proofAuthorizingKey,
      }

      const encoder = new JsonEncoder()

      const encoded = encoder.encode(accountImport)

      const decoded = encoder.decode(encoded)
      expect(decoded).toMatchObject(accountImport)
    })

    it('encodes and decodes accounts with multisig signer keys', () => {
      const key = generateKey()

      const accountImport: AccountImport = {
        version: ACCOUNT_SCHEMA_VERSION,
        name: 'test',
        spendingKey: null,
        viewKey: key.viewKey,
        incomingViewKey: key.incomingViewKey,
        outgoingViewKey: key.outgoingViewKey,
        publicAddress: key.publicAddress,
        createdAt: null,
        multisigKeys: {
          publicKeyPackage: 'cccc',
          identifier: 'aaaa',
          keyPackage: 'bbbb',
        },
        proofAuthorizingKey: key.proofAuthorizingKey,
      }

      const encoder = new JsonEncoder()

      const encoded = encoder.encode(accountImport)

      const decoded = encoder.decode(encoded)
      expect(decoded).toMatchObject(accountImport)
    })
  })
})
