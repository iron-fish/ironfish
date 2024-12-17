/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKeyFromPrivateKey, Key } from '@ironfish/rust-nodejs'
import { ACCOUNT_SCHEMA_VERSION } from '../../account/account'
import { AccountImport } from '../accountImport'
import {
  AccountDecodingOptions,
  AccountEncoder,
  DecodeFailed,
  DecodeInvalidName,
} from '../encoder'

export class SpendingKeyEncoder implements AccountEncoder {
  encode(value: AccountImport): string {
    if (!value.spendingKey) {
      throw new Error('Spending key is required for spending key encoder')
    }
    return value.spendingKey
  }

  decode(spendingKey: string, options: AccountDecodingOptions): AccountImport {
    let key: Key
    try {
      key = generateKeyFromPrivateKey(spendingKey)
    } catch (e) {
      throw new DecodeFailed(
        `Invalid spending key: ${(e as Error).message}`,
        this.constructor.name,
      )
    }

    if (!options.name) {
      throw new DecodeInvalidName('Name option is required for spending key encoder')
    }

    return {
      name: options.name,
      spendingKey: spendingKey,
      viewKey: key.viewKey,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      createdAt: null,
      version: ACCOUNT_SCHEMA_VERSION,
      proofAuthorizingKey: key.proofAuthorizingKey,
      ledger: false,
    }
  }
}
