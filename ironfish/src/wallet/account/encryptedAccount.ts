/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { decrypt } from '@ironfish/rust-nodejs'
import { AccountValueEncoding, EncryptedAccountValue } from '../walletdb/accountValue'
import { WalletDB } from '../walletdb/walletdb'
import { Account } from './account'

export class EncryptedAccount {
  private readonly walletDb: WalletDB
  readonly data: Buffer

  constructor({ data, walletDb }: { data: Buffer; walletDb: WalletDB }) {
    this.data = data
    this.walletDb = walletDb
  }

  decrypt(passphrase: string): Account {
    const decryptedAccountValue = decrypt(this.data, passphrase)
    if (!decryptedAccountValue) {
      throw new Error('Failed to decrypt payload')
    }

    const encoder = new AccountValueEncoding()
    const accountValue = encoder.deserialize(decryptedAccountValue)
    return new Account({ accountValue, walletDb: this.walletDb })
  }

  serialize(): EncryptedAccountValue {
    return {
      encrypted: true,
      data: this.data,
    }
  }
}
