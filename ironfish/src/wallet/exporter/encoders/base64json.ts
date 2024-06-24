/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AccountImport } from '../accountImport'
import { AccountDecodingOptions, AccountEncoder, DecodeFailed } from '../encoder'
import { JsonEncoder } from './json'

export const BASE64_JSON_ACCOUNT_PREFIX = 'ifaccount'

export class Base64JsonEncoder implements AccountEncoder {
  encode(value: AccountImport): string {
    const binary = Buffer.from(new JsonEncoder().encode(value))
    const encoded = binary.toString('base64')
    return `${BASE64_JSON_ACCOUNT_PREFIX}${encoded}`
  }

  decode(value: string, options?: AccountDecodingOptions): AccountImport {
    if (value.startsWith(BASE64_JSON_ACCOUNT_PREFIX)) {
      const encoded = value.slice(BASE64_JSON_ACCOUNT_PREFIX.length)
      const json = Buffer.from(encoded, 'base64').toString()
      return new JsonEncoder().decode(json, options)
    }

    throw new DecodeFailed('Invalid prefix for base64 encoded account')
  }
}
