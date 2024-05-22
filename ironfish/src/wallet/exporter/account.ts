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

export function encodeAccountImport(
  value: AccountImport,
  format: AccountFormat,
  options: AccountEncodingOptions = {},
): string {
  if (options.viewOnly) {
    value.spendingKey = null

    if (value.multisigKeys) {
      value.multisigKeys = {
        publicKeyPackage: value.multisigKeys.publicKeyPackage,
      }
    }
  }

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

export function decodeAccountImport(
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
