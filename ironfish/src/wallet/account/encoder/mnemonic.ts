/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  generateKeyFromPrivateKey,
  LanguageCode,
  spendingKeyToWords,
  wordsToSpendingKey,
} from '@ironfish/rust-nodejs'
import { LanguageUtils } from '../../../utils'
import { AccountImport } from '../../walletdb/accountValue'
import { ACCOUNT_SCHEMA_VERSION } from '../account'
import {
  AccountDecodingOptions,
  AccountEncoder,
  AccountEncodingOptions,
  DecodeFailed,
  DecodeInvalid,
} from './encoder'

export class MnemonicEncoder implements AccountEncoder {
  encode(value: AccountImport, options: AccountEncodingOptions): string {
    if (!value.spendingKey) {
      throw new Error('Spending key is required for mnemonic key encoder')
    }

    return spendingKeyToWords(
      value.spendingKey,
      options?.language
        ? LanguageUtils.LANGUAGES[options.language]
        : LanguageUtils.inferLanguageCode() || LanguageCode.English,
    )
  }

  decode(value: string, options: AccountDecodingOptions): AccountImport {
    let spendingKey = ''
    let language = null
    for (const code of Object.values(LanguageUtils.LANGUAGES)) {
      try {
        spendingKey = wordsToSpendingKey(value, code)
      } catch (e) {
        continue
      }
      language = LanguageUtils.languageCodeToKey(code)
    }
    if (language === null) {
      throw new DecodeFailed('Invalid mnemonic', this.constructor.name)
    }
    if (!options.name) {
      throw new DecodeInvalid('Name option is required for mnemonic key encoder')
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
