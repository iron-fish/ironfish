/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { Node } from '../../utils'
import { Account } from '../../wallet'
import { Migration } from '../migration'
import { GetStores } from './026-timestamp-to-transactions/stores'

export class Migration026 extends Migration {
  path = __filename

  prepare(node: Node): IDatabase {
    return createDB({ location: node.config.walletDatabasePath })
  }

  async forward(
    node: Node,
    db: IDatabase,
    _tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const accounts = []
    const stores = GetStores(db)

    for await (const account of stores.old.accounts.getAllValuesIter()) {
      accounts.push(
        new Account({
          ...account,
          createdAt: null,
          walletDb: node.wallet.walletDb,
        }),
      )
    }

    const accountsString =
      accounts.length === 1 ? `${accounts.length} account` : `${accounts.length} accounts`
    logger.info(`Indexing transaction timestamps for ${accountsString}`)

    for (const account of accounts) {
      logger.info('')
      logger.info(`  Indexing transaction timestamps for account ${account.name}`)

      let transactionCount = 0
      for await (const { timestamp, transaction } of stores.old.transactions.getAllValuesIter(
        undefined,
        account.prefixRange,
      )) {
        await stores.new.timestampToTransactionHash.put(
          [account.prefix, [timestamp.getTime(), transaction.hash()]],
          null,
        )

        transactionCount++
      }

      const transactionsString =
        transactionCount === 1
          ? `${transactionCount} transaction`
          : `${transactionCount} transactions`
      logger.info(`  Completed indexing ${transactionsString} for account ${account.name}`)
    }

    await stores.old.timestampToTransactionHash.clear()
    logger.info('')
  }

  async backward(node: Node, db: IDatabase): Promise<void> {
    const accounts = []
    const stores = GetStores(db)

    for await (const account of stores.old.accounts.getAllValuesIter()) {
      accounts.push(
        new Account({
          ...account,
          createdAt: null,
          walletDb: node.wallet.walletDb,
        }),
      )
    }

    for (const account of accounts) {
      for await (const { timestamp, transaction } of stores.old.transactions.getAllValuesIter(
        undefined,
        account.prefixRange,
      )) {
        await stores.old.timestampToTransactionHash.put(
          [account.prefix, timestamp.getTime()],
          transaction.hash(),
        )
      }

      await stores.new.timestampToTransactionHash.clear()
    }
  }
}
