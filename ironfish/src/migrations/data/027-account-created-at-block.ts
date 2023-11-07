/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { Database, Migration, MigrationContext } from '../migration'
import { GetStores } from './027-account-created-at-block/stores'

export class Migration027 extends Migration {
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
  ): Promise<void> {
    const stores = GetStores(db)

    logger.info(`Migrating account data to store block-based creation time`)

    for await (const accountValue of stores.old.accounts.getAllValuesIter(tx)) {
      logger.info(` Migrating account ${accountValue.name}`)

      await stores.new.accounts.put(accountValue.id, { ...accountValue, createdAt: null }, tx)
    }
  }

  async backward(
    context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const stores = GetStores(db)

    logger.info(`Reverting migration of account data to store block-based creation time`)

    for await (const accountValue of stores.new.accounts.getAllValuesIter(tx)) {
      logger.info(` Reverting migration for account ${accountValue.name}`)

      await stores.old.accounts.put(accountValue.id, { ...accountValue, createdAt: null }, tx)
    }
  }
}
