/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Address } from '@ethereumjs/util'
import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { Database, Migration, MigrationContext } from '../migration'
import { GetStores } from './033-add-eth-address-to-account/stores'

export class Migration033 extends Migration {
  path = __filename
  database = Database.WALLET

  prepare(context: MigrationContext): IDatabase {
    return createDB({ location: context.config.walletDatabasePath })
  }

  async forward(
    _context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const stores = GetStores(db)

    logger.info(`Migrating account data to add Ethereum address`)

    for await (const accountValue of stores.old.accounts.getAllValuesIter(tx)) {
      logger.info(` Migrating account ${accountValue.name}`)

      let evmAddress: string | null = null
      if (accountValue.spendingKey) {
        const privateKey = Buffer.from(accountValue.spendingKey, 'hex')
        evmAddress = Address.fromPrivateKey(privateKey).toString()
      }

      await stores.new.accounts.put(
        accountValue.id,
        {
          ...accountValue,
          evmAddress,
        },
        tx,
      )
    }
  }

  async backward(
    _context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const stores = GetStores(db)

    logger.info(`Reverting migration of adding Ethereum address to account`)

    for await (const accountValue of stores.new.accounts.getAllValuesIter(tx)) {
      logger.info(` Reverting migration for account ${accountValue.name}`)

      await stores.old.accounts.put(accountValue.id, accountValue, tx)
    }
  }
}
