/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { Database, Migration, MigrationContext } from '../migration'
import { GetStores } from './030-value-to-unspent-note/stores'

export class Migration030 extends Migration {
  path = __filename
  database = Database.WALLET

  prepare(context: MigrationContext): IDatabase {
    return createDB({ location: context.config.walletDatabasePath })
  }

  async forward(
    _context: MigrationContext,
    db: IDatabase,
    _tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const stores = GetStores(db)

    logger.info(`Indexing all unspent notes and sorting them by value`)

    let unspentNotes = 0

    for await (const [
      prefix,
      assetId,
      ,
      value,
      noteHash,
    ] of stores.old.unspentNoteHashes.getAllKeysIter()) {
      await stores.new.valueToUnspentNoteHash.put([prefix, assetId, value, noteHash], null)
      unspentNotes++
    }

    logger.info(` Indexed ${unspentNotes} unspent notes and sorted by value.`)
  }

  async backward(_context: MigrationContext, db: IDatabase): Promise<void> {
    const stores = GetStores(db)

    await stores.new.valueToUnspentNoteHash.clear()
  }
}
