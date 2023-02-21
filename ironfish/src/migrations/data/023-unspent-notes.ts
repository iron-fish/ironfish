/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { Account } from '../../wallet'
import { Migration } from '../migration'
import { GetNewStores } from './023-unspent-notes/schemaNew'
import { GetOldStores } from './023-unspent-notes/schemaOld'

export class Migration023 extends Migration {
  path = __filename

  prepare(node: IronfishNode): IDatabase {
    return node.wallet.walletDb.db
  }

  async forward(
    node: IronfishNode,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const stores = {
      old: GetOldStores(db),
      new: GetNewStores(db),
    }

    const accounts = []

    for await (const accountValue of stores.old.accounts.getAllValuesIter()) {
      accounts.push(
        new Account({
          ...accountValue,
          walletDb: node.wallet.walletDb,
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
          [
            account.prefix,
            [note.note.assetId(), [note.sequence, [note.note.value(), noteHash]]],
          ],
          null,
        )
        unspentNotes++
      }

      logger.info(` Indexed ${unspentNotes} unspent notes for account ${account.name}`)
    }
  }

  async backward(node: IronfishNode, db: IDatabase): Promise<void> {
    const stores = {
      new: GetNewStores(db),
    }

    await stores.new.unspentNoteHashes.clear()
  }
}
