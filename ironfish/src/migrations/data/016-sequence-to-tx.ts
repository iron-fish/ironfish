/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { IronfishNode } from '../../utils'
import { Database, Migration } from '../migration'
import { GetOldAccounts } from './021-add-version-to-accounts/schemaOld'

export class Migration016 extends Migration {
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
    const accounts = await GetOldAccounts(node, db, tx)

    logger.info(`Indexing on-chain transactions for ${accounts.length} accounts`)

    for (const account of accounts) {
      let onChainCount = 0
      let offChainCount = 0

      logger.info(`Indexing on-chain transactions for account ${account.name}`)
      for await (const transaction of account.getTransactions()) {
        if (transaction.sequence === null) {
          offChainCount++
          continue
        }

        await node.wallet.walletDb.saveSequenceToTransactionHash(
          account,
          transaction.sequence,
          transaction.transaction.hash(),
        )
        onChainCount++
      }

      logger.info(` Indexed ${onChainCount} on-chain transactions`)
      logger.info(` Skipped ${offChainCount} transactions that haven't been added to the chain`)
    }
  }

  async backward(node: IronfishNode): Promise<void> {
    await node.wallet.walletDb.sequenceToTransactionHash.clear()
  }
}
