/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { uniqueId } from 'lodash'
import { v4 as uuid } from 'uuid'
import { DecryptedNotesValue } from '../../account/database/decryptedNotes'
import { Assert } from '../../assert'
import { IronfishNode } from '../../node'
import { Transaction } from '../../primitives'
import { Note, NOTE_LENGTH } from '../../primitives/note'
import { NoteEncrypted } from '../../primitives/noteEncrypted'
import { TransactionHash } from '../../primitives/transaction'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { Migration } from '../migration'
import { AccountsValue } from './013-wallet-2/accounts'
import { loadNewStores } from './013-wallet-2/new/stores'
import { NoteToNullifiersValue } from './013-wallet-2/noteToNullifier'
import { AccountsStore, loadOldStores, TransactionsStore } from './013-wallet-2/old/stores'

type Stores = {
  old: ReturnType<typeof loadOldStores>
  new: ReturnType<typeof loadNewStores>
}

export class Migration013 extends Migration {
  path = __filename

  async prepare(node: IronfishNode): Promise<IDatabase> {
    await node.files.mkdir(node.accounts.db.location, { recursive: true })
    return createDB({ location: node.accounts.db.location })
  }

  async forward(node: IronfishNode, db: IDatabase, tx: IDatabaseTransaction): Promise<void> {
    const stores: Stores = {
      old: loadOldStores(db),
      new: loadNewStores(db),
    }

    const accounts = await this.migrateAccounts(stores.old.accounts, stores.new.accounts)

    const noteToTransaction = await this.buildNoteToTransaction(stores.old.transactions)

    this.migrateDecryptedNotes()

    // noteToNullifier.clear()

    throw new Error('Abort')
  }

  backward(): Promise<void> {
    throw new Error()
  }

  async buildNoteToTransaction(
    transactions: Stores['old']['transactions'],
  ): Promise<BufferMap<Buffer>> {
    const noteToTransaction = new BufferMap<Buffer>()

    for await (const [transactionHash, transactionEntry] of transactions.getAllIter()) {
      const transaction = new Transaction(transactionEntry.transaction)

      for (const note of transaction.notes()) {
        const noteHash = note.merkleHash()
        noteToTransaction.set(noteHash, transactionHash)
      }
    }

    return noteToTransaction
  }

  async migrateAccounts(
    accountsStoreOld: Stores['old']['accounts'],
    accountsStoreNew: Stores['new']['accounts'],
  ): Promise<Array<{ value: AccountsValue; id: string }>> {
    const accounts = []

    for await (const accountEntry of accountsStoreOld.getAllValuesIter()) {
      accounts.push({
        value: accountEntry,
        id: uuid(),
      })
    }

    return accounts
  }

  async migrateDecryptedNotes(
    accountsStore: AccountsStore,
  ): Promise<Array<{ value: AccountsValue; id: string }>> {
    const decryptedNotes: DecryptedNotesValue[] = []

    for await (const [noteHashHex, nullifierEntry] of stores.noteToNullifier.getAllIter()) {
      const noteHash = Buffer.from(noteHashHex, 'hex')
      const transactionHash = noteToTransaction.get(noteHash)

      if (!transactionHash) {
        throw new Error(`Transaction missing for note ${noteHashHex}`)
      }

      const transactionEntry = await stores.transactions.get(transactionHash)
      Assert.isNotUndefined(transactionEntry)

      const transaction = new Transaction(transactionEntry.transaction)
      const note = findNote(transaction, noteHashHex, nullifierEntry)

      if (!note) {
        throw new Error(
          `Could not find note ${noteHashHex} in transaction ${transactionHash.toString(
            'hex',
          )}`,
        )
      }

      const account = accounts.find((a) => note.decryptNoteForSpender(a.value.spendingKey))

      if (!account) {
        node.logger.warn(
          `Could not find the original account that the note ${noteHashHex} was decrypted with, discarding. Tried ${accounts.length} accounts.`,
        )
        continue
      }

      const decryptedNote: DecryptedNotesValue = {
        accountId: account.id,
        noteIndex: nullifierEntry.noteIndex,
        nullifierHash: nullifierEntry.nullifierHash,
        serializedNote: note.serialize(),
        spent: nullifierEntry.spent,
        transactionHash: transactionHash,
      }

      decryptedNotes.push(decryptedNote)
    }
  }

  findEncryptedNote(
    transaction: Transaction,
    noteHash: string,
    nullifierEntry: NoteToNullifiersValue,
  ): NoteEncrypted | null {
    if (nullifierEntry.noteIndex != null) {
      return transaction.getNote(nullifierEntry.noteIndex)
    }

    const noteHashBuffer = Buffer.from(noteHash, 'hex')

    for (const note of transaction.notes()) {
      if (note.merkleHash().equals(noteHashBuffer)) {
        return note
      }
    }

    return null
  }
}
