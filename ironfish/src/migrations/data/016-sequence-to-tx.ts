/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { Database, Migration, MigrationContext } from '../migration'
import { GetOldAccounts } from './021-add-version-to-accounts/schemaOld'

export class Migration016 extends Migration {
  path = __filename
  database = Database.WALLET

  prepare(context: MigrationContext): IDatabase {
    return context.wallet.walletDb.db
  }

  async forward(
    context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const accounts = await GetOldAccounts(context, db, tx)

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

        await context.wallet.walletDb.saveSequenceToTransactionHash(
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

  async backward(context: MigrationContext): Promise<void> {
    await context.wallet.walletDb.sequenceToTransactionHash.clear()
  }
}
