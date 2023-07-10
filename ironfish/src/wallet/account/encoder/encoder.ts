/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LanguageKey } from '../../../utils'
import { AccountImport } from '../../walletdb/accountValue'

export class DecodeInvalid extends Error {}

export class DecodeFailed extends Error {
  decoder: string

  constructor(message?: string, decoder?: string) {
    super(message)
    this.decoder = decoder ?? ''
  }
}

export enum AccountFormat {
  JSON = 'JSON',
  Bech32 = 'Bech32',
  SpendingKey = 'SpendingKey',
  Mnemonic = 'Mnemonic',
}

export type AccountEncodingOptions = {
  language?: LanguageKey
}

export type AccountDecodingOptions = {
  name?: string
}

export type AccountEncoder = {
  encode(value: AccountImport, options?: AccountEncodingOptions): string

  decode(value: string, options?: AccountDecodingOptions): AccountImport
}
