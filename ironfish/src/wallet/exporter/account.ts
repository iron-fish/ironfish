/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { AccountImport } from './accountImport'
import { AccountDecodingOptions, AccountEncodingOptions, DecodeFailed } from './encoder'
import { Base64JsonEncoder } from './encoders/base64json'
import { Bech32Encoder } from './encoders/bech32'
import { Bech32JsonEncoder } from './encoders/bech32json'
import { JsonEncoder } from './encoders/json'
import { MnemonicEncoder } from './encoders/mnemonic'
import { SpendingKeyEncoder } from './encoders/spendingKey'

const ENCODER_VERSIONS = [
  JsonEncoder,
  MnemonicEncoder,
  SpendingKeyEncoder,
  Bech32JsonEncoder,
  Bech32Encoder,
  Base64JsonEncoder,
]

export enum AccountFormat {
  Base64Json = 'Base64Json',
  JSON = 'JSON',
  Mnemonic = 'Mnemonic',
  SpendingKey = 'SpendingKey',
}

const accountFormatToEncoder = new Map([
  [AccountFormat.Base64Json, Base64JsonEncoder],
  [AccountFormat.JSON, JsonEncoder],
  [AccountFormat.Mnemonic, MnemonicEncoder],
  [AccountFormat.SpendingKey, SpendingKeyEncoder],
])

export function encodeAccountImport(
  value: AccountImport,
  format: AccountFormat,
  options: AccountEncodingOptions = {},
): string {
  const encoder = accountFormatToEncoder.get(format)
  Assert.isNotUndefined(encoder, `Invalid account encoding format: ${format}`)

  return new encoder().encode(value, options)
}

export function decodeAccountImport(
  value: string,
  options: AccountDecodingOptions = {},
): AccountImport {
  const errors: DecodeFailed[] = []

  if (options.format) {
    const encoder = accountFormatToEncoder.get(options.format)
    Assert.isNotUndefined(encoder, `Invalid account decoding format: ${options.format}`)

    return new encoder().decode(value, options)
  }

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
