/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKeyFromPrivateKey } from '@ironfish/rust-nodejs'
import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { IronfishNode } from '../../utils'
import { Database, Migration } from '../migration'
import { GetNewStores } from './022-add-view-key-account/schemaNew'
import { GetOldStores } from './022-add-view-key-account/schemaOld'

export class Migration022 extends Migration {
  path = __filename
  database = Database.WALLET

  prepare(node: IronfishNode): IDatabase {
    return node.wallet.walletDb.db
  }

  async forward(
    node: IronfishNode,
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

      const key = generateKeyFromPrivateKey(account.spendingKey)

      const migrated = {
        ...account,
        viewKey: key.viewKey,
      }

      await stores.new.accounts.put(account.id, migrated, tx)
    }

    await stores.old.accounts.clear(tx)
  }

  async backward(
    node: IronfishNode,
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
