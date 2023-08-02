/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { Node } from '../../utils'
import { Database, Migration } from '../migration'
import { GetNewStores } from './021-add-version-to-accounts/schemaNew'
import { GetOldStores } from './021-add-version-to-accounts/schemaOld'

export class Migration021 extends Migration {
  path = __filename
  database = Database.WALLET

  prepare(node: Node): IDatabase {
    return node.wallet.walletDb.db
  }

  async forward(
    node: Node,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const stores = {
      old: GetOldStores(db),
      new: GetNewStores(db),
    }

    for await (const account of stores.old.accounts.getAllValuesIter(tx)) {
      logger.info(`  Migrating account ${account.name}`)

      const migrated = {
        ...account,
        version: 1,
      }

      await stores.new.accounts.put(account.id, migrated, tx)
    }

    await stores.old.accounts.clear(tx)
  }

  async backward(
    node: Node,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const stores = {
      old: GetOldStores(db),
      new: GetNewStores(db),
    }

    for await (const account of stores.new.accounts.getAllValuesIter(tx)) {
      logger.info(`  Migrating account ${account.name}`)
      await stores.old.accounts.put(account.id, account, tx)
    }

    await stores.new.accounts.clear(tx)
  }
}
