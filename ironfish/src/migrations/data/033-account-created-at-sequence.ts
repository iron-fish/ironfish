/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { Database, Migration, MigrationContext } from '../migration'
import { GetStores } from './033-account-created-at-sequence/stores'

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
  ): Promise<void> {
    const stores = GetStores(db)

    const confirmations = context.config.get('confirmations')

    for await (const accountValue of stores.old.accounts.getAllValuesIter(tx)) {
      logger.debug(` Migrating account ${accountValue.name}`)

      const createdAt = accountValue.createdAt
        ? { sequence: Math.max(1, accountValue.createdAt.sequence - confirmations) }
        : null

      const migrated = {
        ...accountValue,
        createdAt,
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
      await stores.old.accounts.put(accountValue.id, { ...accountValue, createdAt: null }, tx)
    }
  }
}
