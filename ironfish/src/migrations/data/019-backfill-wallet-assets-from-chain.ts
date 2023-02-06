/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { AssetValueEncoding } from '../../blockchain/database/assetValue'
import { AssetSchema } from '../../blockchain/schema'
import { Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { BUFFER_ENCODING, IDatabase, IDatabaseStore, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { Account } from '../../wallet'
import { Migration } from '../migration'

export class Migration019 extends Migration {
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
    const chainDb = createDB({ location: node.config.chainDatabasePath })
    await chainDb.open()

    const chainAssets: IDatabaseStore<AssetSchema> = chainDb.addStore({
      name: 'bA',
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: new AssetValueEncoding(),
    })

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
      
      for await (const { note, sequence, blockHash: hash } of account.getNotes()) {
        const asset = await node.wallet.walletDb.getAsset(account, note.assetId(), tx)

        if (!asset) {
          const chainAsset = await chainAssets.get(note.assetId())
          Assert.isNotUndefined(chainAsset, 'Asset must be non-null in the chain')
          console.log(chainAsset)
          await account.saveAssetFromChain(
            chainAsset.createdTransactionHash,
            chainAsset.id,
            chainAsset.metadata,
            chainAsset.name,
            chainAsset.owner,
            { hash, sequence },
            tx,
          )
        }
      }

      logger.info(`  Completed backfilling assets for account ${account.name}`)
    }

    await chainDb.close()
    logger.info('')
  }

  async backward(node: IronfishNode): Promise<void> {
    await node.wallet.walletDb.assets.clear()
  }
}
