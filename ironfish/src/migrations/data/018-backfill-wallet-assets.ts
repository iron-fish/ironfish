/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { Node } from '../../utils'
import { Migration } from '../migration'
import { GetOldAccounts } from './021-add-version-to-accounts/schemaOld'

export class Migration018 extends Migration {
  path = __filename

  prepare(node: Node): IDatabase {
    return node.wallet.walletDb.db
  }

  async forward(
    node: Node,
    _db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    // Ensure there are no corrupted records for users who might have failed
    // running this migration
    await node.wallet.walletDb.assets.clear()

    const accounts = await GetOldAccounts(node, _db, tx)

    logger.info(`Backfilling assets for ${accounts.length} accounts`)

    for (const account of accounts) {
      logger.info('')
      logger.info(`  Backfilling assets for account ${account.name}`)

      for await (const transactionValue of account.getTransactionsOrderedBySequence(tx)) {
        await account.saveMintsToAssetsStore(transactionValue, tx)
        await account.saveConnectedBurnsToAssetsStore(transactionValue.transaction, tx)
      }

      let assetCount = 0
      for await (const _ of account.getAssets(tx)) {
        assetCount++
      }

      const assetsString = assetCount === 1 ? `${assetCount} asset` : `${assetCount} : assets`
      logger.info(`  Completed backfilling ${assetsString} for account ${account.name}`)
    }

    logger.info('')
  }

  async backward(node: Node): Promise<void> {
    await node.wallet.walletDb.assets.clear()
  }
}
