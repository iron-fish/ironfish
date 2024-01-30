/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { Account } from '../../wallet'
import { Database, Migration, MigrationContext } from '../migration'
import { GetStores } from './025-backfill-wallet-nullifier-to-transaction-hash/stores'

export class Migration025 extends Migration {
  path = __filename
  database = Database.WALLET

  prepare(context: MigrationContext): IDatabase {
    return createDB({ location: context.config.walletDatabasePath })
  }

  async forward(
    context: MigrationContext,
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
          proofAuthorizingKey: null,
          walletDb: context.wallet.walletDb,
        }),
      )
    }

    const accountsString =
      accounts.length === 1 ? `${accounts.length} account` : `${accounts.length} accounts`
    logger.info(`Backfilling nullifier to transaction hashes for ${accountsString}`)

    for (const account of accounts) {
      logger.info('')
      logger.info(`  Backfilling nullifier to transaction hashes for account ${account.name}`)

      const head = await stores.old.heads.get(account.id)
      // If the account has not scanned, we can skip the backfill
      if (!head) {
        continue
      }

      let transactionCount = 0
      for await (const { blockHash, transaction } of stores.old.transactions.getAllValuesIter(
        undefined,
        account.prefixRange,
      )) {
        // If the transaction is expired, we can skip the backfill
        if (
          !blockHash &&
          transaction.expiration() !== 0 &&
          transaction.expiration() <= head.sequence
        ) {
          continue
        }

        // Backfill the mappings from all transaction spends
        for (const spend of transaction.spends) {
          const existingNullifierToTransactionHash =
            await stores.new.nullifierToTransactionHash.get([account.prefix, spend.nullifier])
          // Upsert a record for connected transactions or if a mapping doesn't already exist
          if (blockHash || !existingNullifierToTransactionHash) {
            await stores.new.nullifierToTransactionHash.put(
              [account.prefix, spend.nullifier],
              transaction.hash(),
            )
          }
        }

        transactionCount++
      }

      const transactionsString =
        transactionCount === 1
          ? `${transactionCount} transaction`
          : `${transactionCount} transactions`
      logger.info(`  Completed backfilling ${transactionsString} for account ${account.name}`)
    }

    logger.info('')
  }

  async backward(
    _context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const stores = GetStores(db)
    logger.info('Clearing nullifierToTransactionHash')
    await stores.new.nullifierToTransactionHash.clear(tx)
  }
}
