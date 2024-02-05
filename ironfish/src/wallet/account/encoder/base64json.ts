/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AccountImport } from '../../walletdb/accountValue'
import { AccountDecodingOptions, AccountEncoder } from './encoder'
import { JsonEncoder } from './json'

export const BASE64_JSON_ACCOUNT_PREFIX = 'ifaccount'

export class Base64JsonEncoder implements AccountEncoder {
  encode(value: AccountImport): string {
    const encoded = Buffer.from(new JsonEncoder().encode(value)).toString('base64')
    return `${BASE64_JSON_ACCOUNT_PREFIX}${encoded}`
  }

  decode(value: string, options?: AccountDecodingOptions): AccountImport {
    if (!value.startsWith(BASE64_JSON_ACCOUNT_PREFIX)) {
      throw new Error('Invalid prefix for base64 encoded account')
    }

    const parts = value.split(BASE64_JSON_ACCOUNT_PREFIX)
    if (parts.length !== 2) {
      throw new Error('Invalid format for base64 encoded account')
    }

    const [_, encoded] = parts
    const encodedJson = Buffer.from(encoded, 'base64').toString()
    return new JsonEncoder().decode(encodedJson, options)
  }
}
