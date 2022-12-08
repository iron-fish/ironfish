/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { BenchUtils } from '../../utils'
import { Account, WalletDB } from '../../wallet'
import { DecryptedNoteValue } from '../../wallet/walletdb/decryptedNoteValue'
import { Migration } from '../migration'

export class Migration014 extends Migration {
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
    await this.migrate(node, db, tx, logger, true)
  }

  async backward(
    node: IronfishNode,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    await this.migrate(node, db, tx, logger, false)
  }

  private async migrate(
    node: IronfishNode,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
    forward: boolean,
  ): Promise<void> {
    const start = BenchUtils.startSegment()

    if (forward) {
      logger.debug('Adding chain state data to decryptedNotes...')
    } else {
      logger.debug('Removing chain state data from decryptedNotes...')
    }

    const walletDb = node.wallet.walletDb

    for await (const accountValue of walletDb.loadAccounts(tx)) {
      const account = new Account({ ...accountValue, walletDb: walletDb })

      logger.debug(`Migrating decrypted notes for account ${account.name}...`)

      let notesMigrated = 0
      await db.withTransaction(tx, async (tx) => {
        for await (const decryptedNote of walletDb.loadDecryptedNotes(account, tx)) {
          if (forward) {
            await this.migrateNoteForward(walletDb, account, decryptedNote, tx, logger)
          } else {
            await this.migrateNoteBackward(walletDb, account, decryptedNote, tx)
          }
          notesMigrated++
        }
      })

      logger.debug(`\tMigrated ${notesMigrated} decrypted notes for account ${account.name}`)
    }

    const end = BenchUtils.endSegment(start)

    logger.debug(BenchUtils.renderSegment(end))
  }

  private async migrateNoteForward(
    walletDb: WalletDB,
    account: Account,
    decryptedNote: DecryptedNoteValue & { hash: Buffer },
    tx: IDatabaseTransaction,
    logger: Logger,
  ): Promise<void> {
    const transactionHash = decryptedNote.transactionHash
    const noteHash = decryptedNote.hash

    let blockHash: Buffer | null = null
    let sequence: number | null = null

    await walletDb.db.withTransaction(tx, async (tx) => {
      const transaction = await walletDb.loadTransaction(account, transactionHash, tx)

      if (transaction === undefined) {
        logger.warn(`Transaction data missing for note ${noteHash.toString('hex')}`)
      } else {
        blockHash = transaction.blockHash
        sequence = transaction.sequence
      }

      const newDecryptedNote: Readonly<DecryptedNoteValue> = {
        ...decryptedNote,
        blockHash,
        sequence,
      }

      await walletDb.saveDecryptedNote(account, noteHash, newDecryptedNote, tx)
    })
  }

  private async migrateNoteBackward(
    walletDb: WalletDB,
    account: Account,
    decryptedNote: DecryptedNoteValue & { hash: Buffer },
    tx: IDatabaseTransaction,
  ): Promise<void> {
    const noteHash = decryptedNote.hash

    await walletDb.db.withTransaction(tx, async (tx) => {
      const oldDecryptedNote: Readonly<DecryptedNoteValue> = {
        ...decryptedNote,
        blockHash: null,
        sequence: null,
      }

      await walletDb.saveDecryptedNote(account, noteHash, oldDecryptedNote, tx)
    })
  }
}
