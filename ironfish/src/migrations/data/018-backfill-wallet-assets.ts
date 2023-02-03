/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { Account } from '../../wallet'
import { Migration } from '../migration'

export class Migration018 extends Migration {
  path = __filename

  prepare(node: IronfishNode): IDatabase {
    return node.wallet.walletDb.db
  }

  async forward(
    node: IronfishNode,
    _db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const accounts = []
    for await (const accountValue of node.wallet.walletDb.loadAccounts(tx)) {
      accounts.push(
        new Account({
          ...accountValue,
          walletDb: node.wallet.walletDb,
        }),
      )
    }

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

  async backward(node: IronfishNode): Promise<void> {
    await node.wallet.walletDb.assets.clear()
  }
}
