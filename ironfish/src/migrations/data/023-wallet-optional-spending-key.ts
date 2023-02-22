/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { Migration } from '../migration'
import { GetNewStores } from './023-wallet-optional-spending-key/schemaNew'
import { GetOldStores } from './023-wallet-optional-spending-key/schemaOld'
export class Migration023 extends Migration {
  path = __filename

  prepare(node: IronfishNode): IDatabase {
    return node.wallet.walletDb.db
  }

  async forward(
    _node: IronfishNode,
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
      await stores.new.accounts.put(account.id, account, tx)
    }

    await stores.old.accounts.clear(tx)
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
