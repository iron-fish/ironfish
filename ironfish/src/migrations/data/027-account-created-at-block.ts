/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { IronfishNode } from '../../utils'
import { Database, Migration } from '../migration'
import { GetStores } from './027-account-created-at-block/stores'

export class Migration027 extends Migration {
  path = __filename
  database = Database.WALLET

  prepare(node: IronfishNode): IDatabase {
    return createDB({ location: node.config.walletDatabasePath })
  }

  async forward(
    node: IronfishNode,
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
    node: IronfishNode,
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
