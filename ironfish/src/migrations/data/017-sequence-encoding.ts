/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger } from '../../logger'
import {
  BufferEncoding,
  DatabaseSchema,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  NULL_ENCODING,
  PrefixEncoding,
  U32_ENCODING_BE,
} from '../../storage'
import { getNoteOutpoint } from '../../wallet/interfaces/noteOutpoint'
import { Database, Migration, MigrationContext } from '../migration'
import { GetOldAccounts } from './021-add-version-to-accounts/schemaOld'

export class Migration017 extends Migration {
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

    logger.info(`Re-indexing transactions for ${accounts.length} accounts`)
    logger.info('')

    for (const account of accounts) {
      let transactionCount = 0

      logger.info(`Indexing on-chain transactions for account ${account.name}`)
      for await (const transactionValue of account.getTransactions()) {
        await context.wallet.walletDb.saveTransaction(
          account,
          transactionValue.transaction.hash(),
          transactionValue,
        )
        transactionCount++
      }

      logger.info(` Indexed ${transactionCount} transactions for account ${account.name}`)
      logger.info('')
    }

    logger.info('Clearing data from old datastores...')

    const { sequenceToNoteHash, sequenceToTransactionHash, pendingTransactionHashes } =
      this.getOldStores(db)

    await sequenceToNoteHash.clear()
    await sequenceToTransactionHash.clear()
    await pendingTransactionHashes.clear()
  }

  async backward(context: MigrationContext, db: IDatabase): Promise<void> {
    const accounts = await GetOldAccounts(context, db)

    const { sequenceToNoteHash, sequenceToTransactionHash, pendingTransactionHashes } =
      this.getOldStores(db)

    for (const account of accounts) {
      for await (const transactionValue of account.getTransactions()) {
        const transactionHash = transactionValue.transaction.hash()

        for (const [index, note] of transactionValue.transaction.notes.entries()) {
          if (transactionValue.sequence !== null) {
            const sequence = transactionValue.sequence

            const noteOutpoint = getNoteOutpoint(transactionValue.transaction, index)

            const decryptedNoteValue = await account.getDecryptedNote(noteOutpoint)

            if (decryptedNoteValue === undefined) {
              continue
            }

            await sequenceToNoteHash.put([account.prefix, [sequence, note.hash()]], null)
            await sequenceToTransactionHash.put(
              [account.prefix, [sequence, transactionHash]],
              null,
            )
          } else {
            const expiration = transactionValue.transaction.expiration()
            await pendingTransactionHashes.put(
              [account.prefix, [expiration, transactionHash]],
              null,
            )
          }
        }
      }
    }

    await context.wallet.walletDb.sequenceToNoteOutpoint.clear()
    await context.wallet.walletDb.sequenceToTransactionHash.clear()
    await context.wallet.walletDb.pendingTransactionHashes.clear()
  }

  getOldStores(db: IDatabase): {
    sequenceToNoteHash: IDatabaseStore<DatabaseSchema>
    sequenceToTransactionHash: IDatabaseStore<DatabaseSchema>
    pendingTransactionHashes: IDatabaseStore<DatabaseSchema>
  } {
    const sequenceToNoteHash = db.addStore({
      name: 's',
      keyEncoding: new PrefixEncoding(
        new BufferEncoding(),
        new PrefixEncoding(U32_ENCODING_BE, new BufferEncoding(), 4),
        4,
      ),
      valueEncoding: NULL_ENCODING,
    })

    const sequenceToTransactionHash = db.addStore({
      name: 'st',
      keyEncoding: new PrefixEncoding(
        new BufferEncoding(),
        new PrefixEncoding(U32_ENCODING_BE, new BufferEncoding(), 4),
        4,
      ),
      valueEncoding: NULL_ENCODING,
    })

    const pendingTransactionHashes = db.addStore({
      name: 'p',
      keyEncoding: new PrefixEncoding(
        new BufferEncoding(),
        new PrefixEncoding(U32_ENCODING_BE, new BufferEncoding(), 4),
        4,
      ),
      valueEncoding: NULL_ENCODING,
    })

    return { sequenceToNoteHash, sequenceToTransactionHash, pendingTransactionHashes }
  }
}
