/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import { AccountImport } from '../../walletdb/accountValue'
import { Base64JsonEncoder } from './base64json'
import { Bech32Encoder } from './bech32'
import { Bech32JsonEncoder } from './bech32json'
import {
  AccountDecodingOptions,
  AccountEncodingOptions,
  AccountFormat,
  DecodeFailed,
} from './encoder'
import { JsonEncoder } from './json'
import { MnemonicEncoder } from './mnemonic'
import { SpendingKeyEncoder } from './spendingKey'

const ENCODER_VERSIONS = [
  JsonEncoder,
  MnemonicEncoder,
  SpendingKeyEncoder,
  Bech32JsonEncoder,
  Bech32Encoder,
  Base64JsonEncoder,
]

export function encodeAccount(
  value: AccountImport,
  format: AccountFormat,
  options: AccountEncodingOptions = {},
): string {
  switch (format) {
    case AccountFormat.JSON:
      return new JsonEncoder().encode(value)
    case AccountFormat.Base64Json:
      return new Base64JsonEncoder().encode(value, options)
    case AccountFormat.SpendingKey:
      return new SpendingKeyEncoder().encode(value)
    case AccountFormat.Mnemonic:
      return new MnemonicEncoder().encode(value, options)
    default:
      return Assert.isUnreachable(format)
  }
}

export function decodeAccount(
  value: string,
  options: AccountDecodingOptions = {},
): AccountImport {
  const errors: DecodeFailed[] = []

  for (const encoder of ENCODER_VERSIONS) {
    try {
      const decoded = new encoder().decode(value, options)

      if (decoded) {
        return decoded
      }
    } catch (e) {
      if (e instanceof DecodeFailed) {
        errors.push(e)
      } else {
        throw e
      }
    }
  }

  const errorString = errors.map((error) => `${error.decoder}: ${error.message}`).join('\n')
  throw new Error(`Account could not be decoded, decoder errors:\n${errorString} `)
}
