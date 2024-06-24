/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { Database, Migration, MigrationContext } from '../migration'
import { GetStores } from './032-add-account-syncing/stores'

export class Migration032 extends Migration {
  path = __filename
  database = Database.WALLET

  prepare(context: MigrationContext): IDatabase {
    return createDB({ location: context.config.walletDatabasePath })
  }

  async forward(
    _context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const stores = GetStores(db)

    for await (const accountValue of stores.old.accounts.getAllValuesIter(tx)) {
      logger.debug(` Migrating account ${accountValue.name}`)

      const migrated = {
        ...accountValue,
        scanningEnabled: true,
      }

      await stores.new.accounts.put(accountValue.id, migrated, tx)
    }
  }

  async backward(
    _context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
  ): Promise<void> {
    const stores = GetStores(db)

    for await (const accountValue of stores.new.accounts.getAllValuesIter(tx)) {
      await stores.old.accounts.put(accountValue.id, accountValue, tx)
    }
  }
}
