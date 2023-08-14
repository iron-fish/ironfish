/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { IronfishNode } from '../../utils'
import { Database, Migration } from '../migration'
import { GetStores } from './023-wallet-optional-spending-key/stores'

export class Migration023 extends Migration {
  path = __filename
  database = Database.WALLET

  prepare(node: IronfishNode): IDatabase {
    return node.wallet.walletDb.db
  }

  async forward(
    _node: IronfishNode,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const stores = GetStores(db)

    for await (const account of stores.old.accounts.getAllValuesIter(tx)) {
      logger.info(`  Migrating account ${account.name}`)
      await stores.new.accounts.put(account.id, account, tx)
    }
  }

  backward(
    _node: IronfishNode,
    _db: IDatabase,
    _tx: IDatabaseTransaction | undefined,
    _logger: Logger,
  ): Promise<void> {
    throw new Error(
      'Cannot reverse migration, optional spending key cannot be coerced to string',
    )
  }
}
