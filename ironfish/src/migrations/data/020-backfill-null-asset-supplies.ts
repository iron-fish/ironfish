/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { BufferUtils, IronfishNode } from '../../utils'
import { Database, Migration } from '../migration'
import { GetOldAccounts } from './021-add-version-to-accounts/schemaOld'

export class Migration020 extends Migration {
  path = __filename
  database = Database.WALLET

  prepare(node: IronfishNode): IDatabase {
    return node.wallet.walletDb.db
  }

  async forward(
    node: IronfishNode,
    _db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const accounts = await GetOldAccounts(node, _db, tx)

    logger.info(`Backfilling assets for ${accounts.length} accounts`)

    for (const account of accounts) {
      logger.info('')

      let assetCount = 0
      logger.info(`  Clearing assets for account ${account.name}`)
      for await (const asset of account.getAssets(tx)) {
        if (asset.creator.toString('hex') !== account.publicAddress) {
          continue
        }

        logger.info(`  Re-syncing asset ${BufferUtils.toHuman(asset.name)}`)
        await node.wallet.walletDb.deleteAsset(account, asset.id, tx)
        assetCount++
      }

      for await (const transactionValue of account.getTransactionsOrderedBySequence(tx)) {
        await account.saveMintsToAssetsStore(transactionValue, null, tx)
        await account.saveConnectedBurnsToAssetsStore(transactionValue.transaction, tx)
      }

      const assetsString = assetCount === 1 ? `${assetCount} asset` : `${assetCount} assets`
      logger.info(`  Completed backfilling ${assetsString} for account ${account.name}`)
    }

    logger.info('')
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async backward(): Promise<void> {}
}
