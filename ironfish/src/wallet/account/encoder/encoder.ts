/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantIdentity, ParticipantSecret } from '@ironfish/rust-nodejs'
import { LanguageKey } from '../../../utils'
import { AccountImport } from '../../walletdb/accountValue'

export class DecodeInvalid extends Error {}

export class DecodeInvalidName extends DecodeInvalid {
  name = this.constructor.name
}

export class DecodeFailed extends Error {
  decoder: string

  constructor(message?: string, decoder?: string) {
    super(message)
    this.decoder = decoder ?? ''
  }
}

export enum AccountFormat {
  Base64Json = 'Base64Json',
  JSON = 'JSON',
  Mnemonic = 'Mnemonic',
  SpendingKey = 'SpendingKey',
}

export interface MultisigIdentityEncryption {
  kind: 'MultisigIdentity'
  identity: ParticipantIdentity | Buffer
}

// This is meant to be a tagged union type: `AccountEncryptionMethod = Method1 | Method2 | Method3 | ...`
export type AccountEncryptionMethod = MultisigIdentityEncryption

export function isMultisigIdentityEncryption(
  method: AccountEncryptionMethod,
): method is MultisigIdentityEncryption {
  return 'kind' in method && method.kind === 'MultisigIdentity'
}

export type AccountEncodingOptions = {
  language?: LanguageKey
  encryptWith?: AccountEncryptionMethod
}

export type AccountDecodingOptions = {
  name?: string
  // It would have been nice to have a `wallet?: Wallet` field and let the
  // encoders extract all the decryption information they needed from it, but
  // sadly interacting with the wallet DB is an asynchronous operation, and
  // decoders are all synchronous
  multisigSecret?: ParticipantSecret | Buffer
}

export type AccountEncoder = {
  encode(value: AccountImport, options?: AccountEncodingOptions): string

  decode(value: string, options?: AccountDecodingOptions): AccountImport
}
