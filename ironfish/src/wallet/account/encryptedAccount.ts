/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { decrypt } from '@ironfish/rust-nodejs'
import { AccountDecryptionFailedError } from '../errors'
import { AccountValueEncoding, EncryptedAccountValue } from '../walletdb/accountValue'
import { WalletDB } from '../walletdb/walletdb'
import { Account } from './account'
import { MasterKey } from '../masterKey'

export class EncryptedAccount {
  private readonly walletDb: WalletDB
  readonly data: Buffer
  readonly salt: Buffer
  readonly nonce: Buffer

  constructor({ data, salt, nonce, walletDb }: { data: Buffer; salt: Buffer; nonce: Buffer; walletDb: WalletDB }) {
    this.data = data
    this.salt = salt
    this.nonce = nonce
    this.walletDb = walletDb
  }

  decrypt(masterKey: MasterKey): Account {
    try {
      const derivedKey = masterKey.derive(this.salt, this.nonce)
      const decryptedAccountValue = derivedKey.decrypt(this.data)
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
      data: this.data,
      salt: this.salt,
      nonce: this.nonce
    }
  }
}
