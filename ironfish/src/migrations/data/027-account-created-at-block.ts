/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { Account } from '../../wallet'
import { Migration } from '../migration'
import { GetStores } from './027-account-created-at-block/stores'

export class Migration027 extends Migration {
  path = __filename

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
      const account = new Account({
        ...accountValue,
        createdAt: null,
        walletDb: node.wallet.walletDb,
      })

      logger.info(` Migrating account ${account.name}`)

      await stores.new.accounts.put(account.id, account, tx)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async backward(): Promise<void> {}
}
