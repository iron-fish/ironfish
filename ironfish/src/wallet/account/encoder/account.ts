/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import { AccountExport } from '../../walletdb/accountValue'
import { Bech32Encoder } from './bech32'
import { Bech32JsonEncoder } from './bech32json'
import { AccountDecodingOptions, AccountEncodingOptions, AccountFormat } from './encoder'
import { JsonEncoder } from './json'
import { MnemonicEncoder } from './mnemonic'
import { SpendingKeyEncoder } from './spendingKey'

const ENCODER_VERSIONS = [
  JsonEncoder,
  MnemonicEncoder,
  SpendingKeyEncoder,
  Bech32JsonEncoder,
  Bech32Encoder,
]

export function encodeAccount(
  value: AccountExport,
  format: AccountFormat,
  options: AccountEncodingOptions = {},
): string {
  switch (format) {
    case AccountFormat.JSON:
      return new JsonEncoder().encode(value)
    case AccountFormat.Bech32:
      return new Bech32Encoder().encode(value)
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
): AccountExport {
  let decoded = null
  for (const encoder of ENCODER_VERSIONS) {
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
