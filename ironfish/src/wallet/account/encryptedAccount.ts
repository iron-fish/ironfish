/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { decrypt } from '@ironfish/rust-nodejs'
import { AccountDecryptionFailedError } from '../errors'
import { AccountValueEncoding, EncryptedAccountValue } from '../walletdb/accountValue'
import { WalletDB } from '../walletdb/walletdb'
import { Account } from './account'

export class EncryptedAccount {
  private readonly walletDb: WalletDB
  readonly id: string
  readonly data: Buffer

  constructor({
    encryptedAccountValue,
    walletDb,
  }: {
    encryptedAccountValue: EncryptedAccountValue
    walletDb: WalletDB
  }) {
    this.id = encryptedAccountValue.id
    this.data = encryptedAccountValue.data
    this.walletDb = walletDb
  }

  decrypt(passphrase: string): Account {
    try {
      const decryptedAccountValue = decrypt(this.data, passphrase)
      const encoder = new AccountValueEncoding()
      const accountValue = encoder.deserializeDecrypted(decryptedAccountValue)

      return new Account({ accountValue, walletDb: this.walletDb })
    } catch {
      throw new AccountDecryptionFailedError()
    }
  }

  serialize(): EncryptedAccountValue {
    return {
      encrypted: true,
      id: this.id,
      data: this.data,
    }
  }
}
