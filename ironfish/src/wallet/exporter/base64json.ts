/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AccountImport } from '../walletdb/accountValue'
import {
  AccountDecodingOptions,
  AccountEncoder,
  AccountEncodingOptions,
  isMultisigIdentityEncryption,
} from './encoder'
import { JsonEncoder } from './json'
import { decodeEncryptedMultisigAccount, encodeEncryptedMultisigAccount } from './multisig'

export const BASE64_JSON_ACCOUNT_PREFIX = 'ifaccount'

export const BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX = 'ifmsaccount'

export class Base64JsonEncoder implements AccountEncoder {
  encode(value: AccountImport, options?: AccountEncodingOptions): string {
    const binary = Buffer.from(new JsonEncoder().encode(value))

    if (!options?.encryptWith) {
      const encoded = binary.toString('base64')
      return `${BASE64_JSON_ACCOUNT_PREFIX}${encoded}`
    } else if (isMultisigIdentityEncryption(options.encryptWith)) {
      const encrypted = encodeEncryptedMultisigAccount(binary, options.encryptWith)
      const encoded = encrypted.toString('base64')
      return `${BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX}${encoded}`
    } else {
      throw new Error('Unknown encryption method requested')
    }
  }

  decode(value: string, options?: AccountDecodingOptions): AccountImport {
    let json
    if (value.startsWith(BASE64_JSON_ACCOUNT_PREFIX)) {
      const encoded = value.slice(BASE64_JSON_ACCOUNT_PREFIX.length)
      json = Buffer.from(encoded, 'base64').toString()
    } else if (value.startsWith(BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX)) {
      const encoded = value.slice(BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX.length)
      const encrypted = Buffer.from(encoded, 'base64')
      json = decodeEncryptedMultisigAccount(encrypted, options).toString()
    } else {
      throw new Error('Invalid prefix for base64 encoded account')
    }

    return new JsonEncoder().decode(json, options)
  }
}
