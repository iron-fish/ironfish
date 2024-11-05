/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig } from '@ironfish/rust-nodejs'
import { Assert } from '../../assert'
import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { MasterKey } from '../../wallet/masterKey'
import { EncryptedWalletMigrationError } from '../errors'
import { Database, Migration, MigrationContext } from '../migration'
import {
  AccountValueEncoding as NewAccountValueEncoding,
  DecryptedAccountValue as NewDecryptedAccountValue,
} from './033-multisig-keys-identity/new/accountValue'
import {
  AccountValueEncoding as OldAccountValueEncoding,
  DecryptedAccountValue as OldDecryptedAccountValue,
  EncryptedAccountValue as OldEncryptedAccountValue,
} from './033-multisig-keys-identity/old/accountValue'
import { isSignerMultisig } from './033-multisig-keys-identity/old/multisigKeys'
import { GetStores } from './033-multisig-keys-identity/stores'

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
    const oldEncoding = new OldAccountValueEncoding()
    const newEncoding = new NewAccountValueEncoding()

    for await (const account of stores.old.accounts.getAllValuesIter(tx)) {
      let decryptedAccount

      // Check if the account is encrypted, and throw an error to allow client
      // code to prompt for passphrase.
      if (account.encrypted) {
        if (!walletPassphrase) {
          throw new EncryptedWalletMigrationError('Cannot run migration on encrypted wallet')
        }

        const masterKeyValue = await stores.old.masterKey.get('key')
        Assert.isNotUndefined(masterKeyValue)

        const masterKey = new MasterKey(masterKeyValue)
        await masterKey.unlock(walletPassphrase)

        // Decrypt encrypted account data
        const decrypted = masterKey.decrypt(account.data, account.salt, account.nonce)
        decryptedAccount = oldEncoding.deserializeDecrypted(decrypted)

        // Apply migration to decrypted account data
        logger.info(`  Migrating account ${decryptedAccount.name}`)
        const migrated = this.accountForward(decryptedAccount)

        // Re-encrypt the migrated data and write it to the store.
        const migratedSerialized = newEncoding.serialize(migrated)
        const { ciphertext: data, salt, nonce } = masterKey.encrypt(migratedSerialized)

        const encryptedAccount: OldEncryptedAccountValue = {
          encrypted: true,
          salt,
          nonce,
          data,
        }

        await stores.new.accounts.put(decryptedAccount.id, encryptedAccount, tx)
      } else {
        decryptedAccount = account

        logger.info(`  Migrating account ${decryptedAccount.name}`)
        const migrated = this.accountForward(decryptedAccount)

        await stores.new.accounts.put(decryptedAccount.id, migrated, tx)
      }
    }
  }

  accountForward(oldValue: OldDecryptedAccountValue): NewDecryptedAccountValue {
    const multisigKeys = oldValue.multisigKeys
    if (!multisigKeys || !isSignerMultisig(multisigKeys)) {
      return oldValue
    }

    const secret = new multisig.ParticipantSecret(Buffer.from(multisigKeys.secret, 'hex'))
    const newValue = {
      ...oldValue,
      multisigKeys: {
        ...multisigKeys,
        identity: secret.toIdentity().serialize().toString('hex'),
      },
    }
    return newValue
  }

  async backward(
    context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
    dryRun: boolean,
    walletPassphrase: string | undefined,
  ): Promise<void> {
    const stores = GetStores(db)
    const oldEncoding = new OldAccountValueEncoding()
    const newEncoding = new NewAccountValueEncoding()

    for await (const account of stores.new.accounts.getAllValuesIter(tx)) {
      let decryptedAccount

      // Check if the account is encrypted, and throw an error to allow client
      // code to prompt for passphrase.
      if (account.encrypted) {
        if (!walletPassphrase) {
          throw new EncryptedWalletMigrationError('Cannot run migration on encrypted wallet')
        }

        // Load master key from database
        const masterKeyValue = await stores.old.masterKey.get('key')
        Assert.isNotUndefined(masterKeyValue)

        const masterKey = new MasterKey(masterKeyValue)
        await masterKey.unlock(walletPassphrase)

        // Decrypt encrypted account data
        const decrypted = masterKey.decrypt(account.data, account.salt, account.nonce)
        decryptedAccount = newEncoding.deserializeDecrypted(decrypted)

        // Apply migration to decrypted account data
        logger.info(`  Migrating account ${decryptedAccount.name}`)
        const migrated = this.accountBackward(decryptedAccount)

        // Re-encrypt the migrated data and write it to the store.
        const migratedSerialized = oldEncoding.serialize(migrated)
        const { ciphertext: data, salt, nonce } = masterKey.encrypt(migratedSerialized)

        const encryptedAccount: OldEncryptedAccountValue = {
          encrypted: true,
          salt,
          nonce,
          data,
        }

        await stores.old.accounts.put(decryptedAccount.id, encryptedAccount, tx)
      } else {
        decryptedAccount = account

        logger.info(`  Migrating account ${decryptedAccount.name}`)
        const migrated = this.accountBackward(decryptedAccount)

        await stores.old.accounts.put(decryptedAccount.id, migrated, tx)
      }
    }
  }

  accountBackward(newValue: NewDecryptedAccountValue): OldDecryptedAccountValue {
    const oldValue = newValue
    return oldValue
  }
}
