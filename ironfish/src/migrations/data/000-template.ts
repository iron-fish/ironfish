/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKeyFromPrivateKey } from '@ironfish/rust-nodejs'
import { Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { Migration } from '../migration'
import { GetNewStores } from './000-template/schemaNew'
import { GetOldStores } from './000-template/schemaOld'

export class Migration000 extends Migration {
  path = __filename

  prepare(node: IronfishNode): IDatabase {
    /* replace line below with node.chain.location if applying migration to the blockchain
     * database
     */
    return createDB({ location: node.config.walletDatabasePath })
  }

  async forward(
    node: IronfishNode,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    // use GetOldStores and GetNewStores to attach datastores with the old and new schemas to the database
    const stores = {
      old: GetOldStores(db),
      new: GetNewStores(db),
    }

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

  }

  async backward(
    node: IronfishNode,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    // use GetOldStores and GetNewStores to attach datastores with the old and new schemas to the database
    const stores = {
      old: GetOldStores(db),
      new: GetNewStores(db),
    }

    // backward migration re-inserts data from new stores into old stores
    for await (const account of stores.new.accounts.getAllValuesIter(tx)) {
      logger.info(`  Migrating account ${account.name}`)
      await stores.old.accounts.put(account.id, account, tx)
    }

    // and clears data from new stores
    await stores.new.accounts.clear(tx)
  }
}
