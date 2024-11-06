/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { EncryptedWalletMigrationError } from '../errors'
import { Database, Migration, MigrationContext } from '../migration'
import { DecryptedAccountValue as NewDecryptedAccountValue } from './033-encrypted-wallet-template/new/accountValue'
import { DecryptedAccountValue as OldDecryptedAccountValue } from './033-encrypted-wallet-template/old/accountValue'
import { GetStores } from './033-encrypted-wallet-template/stores'
import {
  decryptNewEncryptedAccountValue,
  decryptOldEncryptedAccountValue,
  encryptOldAccountValue,
  getKey,
} from './033-encrypted-wallet-template/util'

export class Migration033 extends Migration {
  path = __filename
  database = Database.WALLET

  prepare(context: MigrationContext): IDatabase {
    return createDB({ location: context.config.walletDatabasePath })
  }

  async forward(
    context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
    dryRun: boolean,
    walletPassphrase: string | undefined,
  ): Promise<void> {
    const stores = GetStores(db)

    // forward migration inserts from old stores into new stores
    for await (const account of stores.old.accounts.getAllValuesIter(tx)) {
      let decryptedAccount

      // Check if the account is encrypted, and throw an error to allow client
      // code to prompt for passphrase.
      //
      // This assumes that serialization of encrypted accounts has NOT changed,
      // so deserialization works with both old and new schema.
      if (account.encrypted) {
        if (!walletPassphrase) {
          throw new EncryptedWalletMigrationError('Cannot run migration on encrypted wallet')
        }

        const key = await getKey(
          stores.old.masterKey,
          account.salt,
          account.nonce,
          walletPassphrase,
        )

        // Decrypt the old encrypted account data and apply migration
        decryptedAccount = decryptOldEncryptedAccountValue(account.data, key)

        logger.info(`  Migrating account ${decryptedAccount.name}`)

        const migrated = this._accountForward(decryptedAccount)

        // Re-encrypt the migrated data and write it to the store.
        // Assumes that schema for encrypted accounts has NOT changed.
        const encryptedAccount = encryptOldAccountValue(
          migrated,
          key,
          account.salt,
          account.nonce,
        )

        await stores.new.accounts.put(decryptedAccount.id, encryptedAccount, tx)

        key.destroy()
      } else {
        decryptedAccount = account

        logger.info(`  Migrating account ${decryptedAccount.name}`)

        const migrated = this._accountForward(decryptedAccount)

        await stores.new.accounts.put(decryptedAccount.id, migrated, tx)
      }
    }
  }

  _accountForward(oldValue: OldDecryptedAccountValue): NewDecryptedAccountValue {
    // Insert forward migration logic for a decrypted account
    const newValue = oldValue
    return newValue
  }

  /**
   * Writing a backwards migration is optional but suggested
   */
  async backward(
    context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
    dryRun: boolean,
    walletPassphrase: string | undefined,
  ): Promise<void> {
    const stores = GetStores(db)

    for await (const account of stores.new.accounts.getAllValuesIter(tx)) {
      let decryptedAccount

      // Check if the account is encrypted, and throw an error to allow client
      // code to prompt for passphrase.
      //
      // This assumes that serialization of encrypted accounts has NOT changed,
      // so deserialization works with both old and new schema.
      if (account.encrypted) {
        if (!walletPassphrase) {
          throw new EncryptedWalletMigrationError('Cannot run migration on encrypted wallet')
        }

        // Read master key from old store. This assumes that the schema for the
        // master key has NOT changed
        const key = await getKey(
          stores.old.masterKey,
          account.salt,
          account.nonce,
          walletPassphrase,
        )

        decryptedAccount = decryptNewEncryptedAccountValue(account.data, key)

        logger.info(`  Migrating account ${decryptedAccount.name}`)

        const migrated = this._accountBackward(decryptedAccount)

        const encryptedAccount = encryptOldAccountValue(
          migrated,
          key,
          account.salt,
          account.nonce,
        )

        await stores.old.accounts.put(decryptedAccount.id, encryptedAccount, tx)

        key.destroy()
      } else {
        decryptedAccount = account

        logger.info(`  Migrating account ${decryptedAccount.name}`)

        const migrated = this._accountBackward(decryptedAccount)

        await stores.old.accounts.put(decryptedAccount.id, migrated, tx)
      }
    }
  }

  _accountBackward(newValue: NewDecryptedAccountValue): OldDecryptedAccountValue {
    // Insert backward migration logic for a decrypted account
    const oldValue = newValue
    return oldValue
  }
}
