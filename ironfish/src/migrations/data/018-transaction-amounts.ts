/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../assert'
import { Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { Account } from '../../wallet'
import { AssetBalances } from '../../wallet/assetBalances'
import { Migration } from '../migration'

export class Migration018 extends Migration {
  path = __filename

  prepare(node: IronfishNode): IDatabase {
    return node.wallet.walletDb.db
  }

  async forward(
    node: IronfishNode,
    _db: IDatabase,
    _tx: IDatabaseTransaction | undefined,
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

    logger.info(
      `Migration 017-transaction-amounts supports efficiently computing the amount of each asset that an account is able to spend`,
    )
    logger.info(
      `Summing input/output amounts in transactions for ${accounts.length} accounts...`,
    )

    for (const account of accounts) {
      logger.info(
        ` Backfilling input/output amounts from transactions for account ${account.name}...`,
      )

      let transactions = 0

      for await (const transaction of account.getTransactions()) {
        const inputs = new AssetBalances()
        const outputs = new AssetBalances()

        for (const spend of transaction.transaction.spends) {
          const noteHash = await account.getNoteHash(spend.nullifier)

          if (!noteHash) {
            continue
          }

          const decryptedNote = await account.getDecryptedNote(noteHash)

          Assert.isNotUndefined(decryptedNote)

          inputs.increment(decryptedNote.note.assetId(), decryptedNote.note.value())
        }

        for (const note of transaction.transaction.notes) {
          const decryptedNote = await account.getDecryptedNote(note.hash())

          if (!decryptedNote) {
            continue
          }

          outputs.increment(decryptedNote.note.assetId(), decryptedNote.note.value())
        }

        await account.saveTransactionAmounts(transaction.transaction.hash(), inputs, outputs)
        transactions++
      }

      logger.info(
        ` Completed backfilling input/output amounts from ${transactions} transactions for account ${account.name}`,
      )
      logger.info('')
    }
  }

  async backward(node: IronfishNode): Promise<void> {
    await node.wallet.walletDb.transactionAmounts.clear()
  }
}
