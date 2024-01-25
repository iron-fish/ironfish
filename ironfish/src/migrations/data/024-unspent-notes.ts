/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { Account } from '../../wallet'
import { Database, Migration, MigrationContext } from '../migration'
import { GetStores } from './024-unspent-notes/stores'

export class Migration024 extends Migration {
  path = __filename
  database = Database.WALLET

  prepare(context: MigrationContext): IDatabase {
    return createDB({ location: context.config.walletDatabasePath })
  }

  async forward(
    context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const stores = GetStores(db)

    const accounts = []

    for await (const accountValue of stores.old.accounts.getAllValuesIter()) {
      accounts.push(
        new Account({
          ...accountValue,
          createdAt: null,
          walletDb: context.wallet.walletDb,
        }),
      )
    }

    logger.info(`Indexing unspent notes for ${accounts.length} accounts`)

    for (const account of accounts) {
      let unspentNotes = 0

      logger.info(` Indexing unspent notes for account ${account.name}`)
      for await (const [[, noteHash], note] of stores.old.decryptedNotes.getAllIter(
        undefined,
        account.prefixRange,
      )) {
        if (note.sequence === null || note.spent) {
          continue
        }

        await stores.new.unspentNoteHashes.put(
          [account.prefix, note.note.assetId(), note.sequence, note.note.value(), noteHash],
          null,
        )
        unspentNotes++
      }

      logger.info(` Indexed ${unspentNotes} unspent notes for account ${account.name}`)
    }
  }

  async backward(context: MigrationContext, db: IDatabase): Promise<void> {
    const stores = GetStores(db)

    await stores.new.unspentNoteHashes.clear()
  }
}
