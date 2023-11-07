/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKeyFromPrivateKey } from '@ironfish/rust-nodejs'
import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { Database, Migration, MigrationContext } from '../migration'
import { GetStores } from './000-template/stores'

export class Migration000 extends Migration {
  path = __filename
  database = Database.WALLET

  prepare(context: MigrationContext): IDatabase {
    /* replace line below with node.chain.location if applying migration to the blockchain
     * database
     */
    return createDB({ location: context.config.walletDatabasePath })
  }

  async forward(
    context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    // use GetStores to attach datastores with the old and new schemas to the
    // database
    const stores = GetStores(db)

    // forward migration inserts from old stores into new stores
    for await (const account of stores.old.accounts.getAllValuesIter(tx)) {
      logger.info(`  Migrating account ${account.name}`)

      const key = generateKeyFromPrivateKey(account.spendingKey)

      // template example is taken from Migration022 which added viewKey to the accounts store
      const migrated = {
        ...account,
        viewKey: key.viewKey,
      }

      await stores.new.accounts.put(account.id, migrated, tx)
    }

    // Because we changed the table name, we should clear the old table
    // but you don't need this if you use the same table
    await stores.old.accounts.clear(tx)
  }

  /**
   * Writing a backwards migration is optional but suggested
   */
  async backward(
    context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    // use GetStores to attach datastores with the old and new schemas to the
    // database
    const stores = GetStores(db)

    // backward migration re-inserts data from new stores into old stores
    for await (const account of stores.new.accounts.getAllValuesIter(tx)) {
      logger.info(`  Migrating account ${account.name}`)
      await stores.old.accounts.put(account.id, account, tx)
    }

    // Because we changed the table name, we should clear the old table
    // but you don't need this if you use the same table
    await stores.new.accounts.clear(tx)
  }
}
