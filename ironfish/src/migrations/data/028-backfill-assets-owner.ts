/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { IronfishNode } from '../../utils'
import { Database, Migration } from '../migration'
import { GetStores } from './028-backfill-assets-owner/stores'

export class Migration028 extends Migration {
  path = __filename
  database = Database.BLOCKCHAIN

  prepare(node: IronfishNode): IDatabase {
    return createDB({ location: node.config.chainDatabasePath })
  }

  async forward(
    node: IronfishNode,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const stores = GetStores(db)

    logger.info(`Migrating asset data to store owner`)

    for await (const assetValue of stores.old.assets.getAllValuesIter(tx)) {
      const assetName = assetValue.name.toString('utf8')
      const assetIdSlice = assetValue.id.toString('hex').substring(0, 10)
      logger.info(` Migrating asset ${assetIdSlice}... (${assetName})`)

      await stores.new.assets.put(
        assetValue.id,
        { ...assetValue, owner: assetValue.creator },
        tx,
      )
    }
  }

  async backward(
    node: IronfishNode,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const stores = GetStores(db)

    logger.info(`Reverting migration of asset data to store owner`)

    for await (const assetValue of stores.new.assets.getAllValuesIter(tx)) {
      const assetName = assetValue.name.toString('utf8')
      const assetIdSlice = assetValue.id.toString('hex').substring(0, 10)
      logger.info(` Reverting migration for asset ${assetIdSlice} (${assetName})`)

      const { owner: _, ...oldAssetValue } = assetValue

      await stores.old.assets.put(assetValue.id, { ...oldAssetValue }, tx)
    }
  }
}
