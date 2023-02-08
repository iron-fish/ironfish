/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { Account } from '../../wallet'
import { Migration } from '../migration'

export class Migration020 extends Migration {
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
    const accounts = []

    for await (const accountValue of node.wallet.walletDb.loadAccounts()) {
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
      for await (const note of account.getNotes()) {
        if (note.sequence === null || note.spent) {
          continue
        }

        await node.wallet.walletDb.addUnspentNoteHash(account, note.hash, note)
        unspentNotes++
      }

      logger.info(` Indexed ${unspentNotes} unspent notes for account ${account.name}`)
    }
  }

  async backward(node: IronfishNode): Promise<void> {
    await node.wallet.walletDb.unspentNoteHashes.clear()
  }
}
