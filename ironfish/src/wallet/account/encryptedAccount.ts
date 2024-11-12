/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AccountDecryptionFailedError } from '../errors'
import { MasterKey } from '../masterKey'
import { AccountValueEncoding, EncryptedAccountValue } from '../walletdb/accountValue'
import { WalletDB } from '../walletdb/walletdb'
import { Account } from './account'

export class EncryptedAccount {
  private readonly walletDb: WalletDB
  readonly salt: Buffer
  readonly nonce: Buffer
  readonly data: Buffer

  constructor({
    accountValue,
    walletDb,
  }: {
    accountValue: EncryptedAccountValue
    walletDb: WalletDB
  }) {
    this.salt = accountValue.salt
    this.nonce = accountValue.nonce
    this.data = accountValue.data
    this.walletDb = walletDb
  }

  decrypt(masterKey: MasterKey): Account {
    try {
      const decryptedAccountValue = masterKey.decrypt(this.data, this.salt, this.nonce)

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
      salt: this.salt,
      nonce: this.nonce,
      data: this.data,
    }
  }
}
