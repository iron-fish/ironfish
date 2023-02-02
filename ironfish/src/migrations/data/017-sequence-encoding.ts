/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger } from '../../logger'
import { IronfishNode } from '../../node'
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
import { Account } from '../../wallet'
import { Migration } from '../migration'

export class Migration017 extends Migration {
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
    const accounts = await this.getAccounts(node)

    logger.info(`Re-indexing transactions for ${accounts.length} accounts`)
    logger.info('')

    for (const account of accounts) {
      let transactionCount = 0

      logger.info(`Indexing on-chain transactions for account ${account.name}`)
      for await (const transactionValue of account.getTransactions()) {
        await node.wallet.walletDb.saveTransaction(
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

  async backward(node: IronfishNode, db: IDatabase): Promise<void> {
    const accounts = await this.getAccounts(node)

    const { sequenceToNoteHash, sequenceToTransactionHash, pendingTransactionHashes } =
      this.getOldStores(db)

    for (const account of accounts) {
      for await (const transactionValue of account.getTransactions()) {
        const transactionHash = transactionValue.transaction.hash()

        for (const note of transactionValue.transaction.notes) {
          if (transactionValue.sequence !== null) {
            const sequence = transactionValue.sequence

            const decryptedNoteValue = await account.getDecryptedNote(note.hash())

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

    await node.wallet.walletDb.sequenceToNoteHash.clear()
    await node.wallet.walletDb.sequenceToTransactionHash.clear()
    await node.wallet.walletDb.pendingTransactionHashes.clear()
  }

  async getAccounts(node: IronfishNode): Promise<Account[]> {
    const accounts = []

    for await (const accountValue of node.wallet.walletDb.loadAccounts()) {
      accounts.push(
        new Account({
          ...accountValue,
          walletDb: node.wallet.walletDb,
        }),
      )
    }

    return accounts
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
