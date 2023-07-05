/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKeyFromPrivateKey } from '@ironfish/rust-nodejs'
import { EncodingError } from 'bufio'
import { AccountImport } from '../../walletdb/accountValue'
import { ACCOUNT_SCHEMA_VERSION } from '../account'
import { AccountDecodingOptions, AccountEncoder } from './encoder'

export class SpendingKeyEncoder implements AccountEncoder {
  encode(value: AccountImport): string {
    if (!value.spendingKey) {
      throw new EncodingError('Spending key is required for spending key encoder')
    }
    return value.spendingKey
  }

  decode(spendingKey: string, options: AccountDecodingOptions): AccountImport {
    if (!options.name) {
      throw new EncodingError('Name option is required for spending key encoder')
    }
    const key = generateKeyFromPrivateKey(spendingKey)
    return {
      name: options.name,
      spendingKey: spendingKey,
      viewKey: key.viewKey,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      createdAt: null,
      version: ACCOUNT_SCHEMA_VERSION,
    }
  }
}
