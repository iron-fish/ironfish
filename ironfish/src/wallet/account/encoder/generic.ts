/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AccountImport } from '../../walletdb/accountValue'
import { Bech32Encoder } from './bech32'
import { Bech32JsonEncoder } from './bech32json'
import {
  AccountDecodingOptions,
  AccountEncoder,
  AccountEncodingOptions,
  Formats,
} from './encoder'
import { JsonEncoder } from './json'
import { MnemonicEncoder } from './mnemonic'
import { SpendingKeyEncoder } from './spendingKey'

export class GenericEncoder implements AccountEncoder {
  versions = [
    JsonEncoder,
    MnemonicEncoder,
    SpendingKeyEncoder,
    Bech32JsonEncoder,
    Bech32Encoder,
  ]

  encode(value: AccountImport, options: AccountEncodingOptions = {}): string {
    switch (options.format) {
      case Formats.JSON:
        return new JsonEncoder().encode(value)
      case Formats.Bech32:
        return new Bech32Encoder().encode(value)
      case Formats.SpendingKey:
        return new SpendingKeyEncoder().encode(value)
      case Formats.Mnemonic:
        return new MnemonicEncoder().encode(value, options)
      default:
        return new Bech32Encoder().encode(value)
    }
  }

  decode(value: string, options: AccountDecodingOptions = {}): AccountImport {
    let decoded = null
    for (const encoder of this.versions) {
      try {
        decoded = new encoder().decode(value, options)
      } catch (e) {
        continue
      }
      if (decoded) {
        return decoded
      }
    }
    throw new Error('Account could not be decoded')
  }
}
