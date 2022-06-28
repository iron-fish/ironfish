/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { FileSystem } from '../fileSystems'
import { Transaction } from '../primitives/transaction'
import {
  BUFFER_ENCODING,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  StringEncoding,
  StringHashEncoding,
} from '../storage'
import { createDB } from '../storage/utils'
import { WorkerPool } from '../workerPool'
import { Account } from './account'
import { AccountsValue, AccountsValueEncoding } from './database/accounts'
import {
  DecryptableNotesValue,
  DecryptableNotesValueEncoding,
} from './database/decryptableNotes'
import { AccountsDBMeta, MetaValue, MetaValueEncoding } from './database/meta'
import { TransactionsValue, TransactionsValueEncoding } from './database/transactions'

const DATABASE_VERSION = 5

const getAccountsDBMetaDefaults = (): AccountsDBMeta => ({
  defaultAccountId: null,
  headHash: null,
})

export class AccountsDB {
  database: IDatabase
  workerPool: WorkerPool
  location: string
  files: FileSystem

  accounts: IDatabaseStore<{ key: string; value: AccountsValue }>

  meta: IDatabaseStore<{
    key: keyof AccountsDBMeta
    value: MetaValue
  }>

  decryptableNotes: IDatabaseStore<{
    key: string
    value: DecryptableNotesValue
  }>

  nullifierToNote: IDatabaseStore<{ key: string; value: string }>

  transactions: IDatabaseStore<{
    key: Buffer
    value: TransactionsValue
  }>

  constructor({
    files,
    location,
    workerPool,
  }: {
    files: FileSystem
    location: string
    workerPool: WorkerPool
  }) {
    this.files = files
    this.location = location
    this.workerPool = workerPool
    this.database = createDB({ location })

    this.meta = this.database.addStore<{
      key: keyof AccountsDBMeta
      value: AccountsDBMeta[keyof AccountsDBMeta]
    }>({
      name: 'meta',
      keyEncoding: new StringEncoding<keyof AccountsDBMeta>(),
      valueEncoding: new MetaValueEncoding(),
    })

    this.accounts = this.database.addStore<{ key: string; value: AccountsValue }>({
      name: 'accounts',
      keyEncoding: new StringEncoding(),
      valueEncoding: new AccountsValueEncoding(),
    })

    this.decryptableNotes = this.database.addStore<{
      key: string
      value: DecryptableNotesValue
    }>({
      name: 'decryptableNotes',
      keyEncoding: new StringHashEncoding(),
      valueEncoding: new DecryptableNotesValueEncoding(),
    })

    this.nullifierToNote = this.database.addStore<{ key: string; value: string }>({
      name: 'nullifierToNote',
      keyEncoding: new StringHashEncoding(),
      valueEncoding: new StringEncoding(),
    })

    this.transactions = this.database.addStore<{
      key: Buffer
      value: TransactionsValue
    }>({
      name: 'transactions',
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: new TransactionsValueEncoding(),
    })
  }

  async open(options: { upgrade?: boolean } = { upgrade: true }): Promise<void> {
    await this.files.mkdir(this.location, { recursive: true })

    await this.database.open()

    if (options.upgrade) {
      await this.database.upgrade(DATABASE_VERSION)
    }
  }

  async close(): Promise<void> {
    await this.database.close()
  }

  async setAccount(account: Account): Promise<void> {
    await this.accounts.put(account.id, account.serialize())
  }

  async removeAccount(id: string): Promise<void> {
    await this.accounts.del(id)
  }

  async setDefaultAccount(id: AccountsDBMeta['defaultAccountId']): Promise<void> {
    await this.meta.put('defaultAccountId', id)
  }

  async setHeadHash(hash: AccountsDBMeta['headHash']): Promise<void> {
    await this.meta.put('headHash', hash)
  }

  async loadAccountsMeta(): Promise<AccountsDBMeta> {
    const meta = { ...getAccountsDBMetaDefaults() }

    for await (const [key, value] of this.meta.getAllIter()) {
      meta[key] = value
    }

    return meta
  }

  async *loadAccounts(): AsyncGenerator<Account, void, unknown> {
    for await (const [id, account] of this.accounts.getAllIter()) {
      yield new Account(id, account)
    }
  }

  async saveTransaction(
    transactionHash: Buffer,
    transaction: {
      transaction: Transaction
      blockHash: string | null
      submittedSequence: number | null
    },
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const serialized = {
      ...transaction,
      transaction: transaction.transaction.serialize(),
    }
    await this.transactions.put(transactionHash, serialized, tx)
  }

  async removeTransaction(transactionHash: Buffer, tx?: IDatabaseTransaction): Promise<void> {
    await this.transactions.del(transactionHash, tx)
  }

  async replaceTransactions(
    map: BufferMap<{
      transaction: Transaction
      blockHash: string | null
      submittedSequence: number | null
    }>,
  ): Promise<void> {
    await this.transactions.clear()

    await this.database.transaction(async (tx) => {
      for (const [key, value] of map) {
        const serialized = {
          ...value,
          transaction: value.transaction.serialize(),
        }
        await this.transactions.put(key, serialized, tx)
      }
    })
  }

  async loadTransactionsIntoMap(
    map: BufferMap<{
      transaction: Transaction
      blockHash: string | null
      submittedSequence: number | null
    }>,
  ): Promise<void> {
    for await (const [key, value] of this.transactions.getAllIter()) {
      const deserialized = {
        ...value,
        transaction: new Transaction(value.transaction),
      }

      map.set(key, deserialized)
    }
  }

  async saveNullifierToNote(
    nullifier: string,
    note: string,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.nullifierToNote.put(nullifier, note, tx)
  }

  async removeNullifierToNote(noteHash: string, tx?: IDatabaseTransaction): Promise<void> {
    await this.nullifierToNote.del(noteHash, tx)
  }

  async replaceNullifierToNoteMap(map: Map<string, string>): Promise<void> {
    await this.nullifierToNote.clear()

    await this.database.transaction(async (tx) => {
      for (const [key, value] of map) {
        await this.nullifierToNote.put(key, value, tx)
      }
    })
  }

  async loadNullifierToNoteMap(map: Map<string, string>): Promise<void> {
    for await (const [key, value] of this.nullifierToNote.getAllIter()) {
      map.set(key, value)
    }
  }

  async saveDecryptableNotes(
    noteHash: string,
    note: Readonly<DecryptableNotesValue>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.decryptableNotes.put(noteHash, note, tx)
  }

  async removeDecryptableNotes(noteHash: string, tx?: IDatabaseTransaction): Promise<void> {
    await this.decryptableNotes.del(noteHash, tx)
  }

  async replaceDecryptableNotesMap(map: Map<string, DecryptableNotesValue>): Promise<void> {
    await this.decryptableNotes.clear()

    await this.database.transaction(async (tx) => {
      for (const [key, value] of map) {
        await this.decryptableNotes.put(key, value, tx)
      }
    })
  }

  async loadDecryptableNotesMap(
    map: Map<
      string,
      { nullifierHash: string | null; noteIndex: number | null; spent: boolean }
    >,
  ): Promise<void> {
    for await (const [key, value] of this.decryptableNotes.getAllIter()) {
      map.set(key, value)
    }
  }
}
