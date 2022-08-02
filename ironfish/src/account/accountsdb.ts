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
import { AccountsDBMeta, MetaValue, MetaValueEncoding } from './database/meta'
import {
  NoteToNullifiersValue,
  NoteToNullifiersValueEncoding,
} from './database/noteToNullifiers'
import { TransactionsValue, TransactionsValueEncoding } from './database/transactions'

const DATABASE_VERSION = 11

export const AccountDefaults: AccountsValue = {
  name: '',
  spendingKey: '',
  incomingViewKey: '',
  outgoingViewKey: '',
  publicAddress: '',
  rescan: null,
}

const getAccountsDBMetaDefaults = (): AccountsDBMeta => ({
  defaultAccountName: null,
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

  // Transaction-related database stores
  noteToNullifier: IDatabaseStore<{
    key: string
    value: NoteToNullifiersValue
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

    this.noteToNullifier = this.database.addStore<{
      key: string
      value: NoteToNullifiersValue
    }>({
      name: 'noteToNullifier',
      keyEncoding: new StringHashEncoding(),
      valueEncoding: new NoteToNullifiersValueEncoding(),
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

  async open(): Promise<void> {
    await this.files.mkdir(this.location, { recursive: true })
    await this.database.open()
    await this.database.upgrade(DATABASE_VERSION)
  }

  async close(): Promise<void> {
    await this.database.close()
  }

  async setAccount(account: Account): Promise<void> {
    await this.accounts.put(account.name, account.serialize())
  }

  async removeAccount(name: string): Promise<void> {
    await this.accounts.del(name)
  }

  async setDefaultAccount(name: AccountsDBMeta['defaultAccountName']): Promise<void> {
    await this.meta.put('defaultAccountName', name)
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
    for await (const account of this.accounts.getAllValuesIter()) {
      yield new Account(account)
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
    for await (const nullifierToNoteKey of this.nullifierToNote.getAllKeysIter()) {
      const value = await this.nullifierToNote.get(nullifierToNoteKey)

      if (!value) {
        throw new Error('Value must exist if key exists')
      }

      map.set(nullifierToNoteKey, value)
    }
  }

  async saveNoteToNullifier(
    noteHash: string,
    note: Readonly<{
      nullifierHash: string | null
      noteIndex: number | null
      spent: boolean
    }>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.noteToNullifier.put(noteHash, note, tx)
  }

  async removeNoteToNullifier(noteHash: string, tx?: IDatabaseTransaction): Promise<void> {
    await this.noteToNullifier.del(noteHash, tx)
  }

  async replaceNoteToNullifierMap(
    map: Map<
      string,
      { nullifierHash: string | null; noteIndex: number | null; spent: boolean }
    >,
  ): Promise<void> {
    await this.noteToNullifier.clear()

    await this.database.transaction(async (tx) => {
      for (const [key, value] of map) {
        await this.noteToNullifier.put(key, value, tx)
      }
    })
  }

  async loadNoteToNullifierMap(
    map: Map<
      string,
      { nullifierHash: string | null; noteIndex: number | null; spent: boolean }
    >,
  ): Promise<void> {
    await this.database.transaction(async (tx) => {
      for await (const noteToNullifierKey of this.noteToNullifier.getAllKeysIter(tx)) {
        const value = await this.noteToNullifier.get(noteToNullifierKey)

        if (!value) {
          throw new Error('Value must exist if key exists')
        }

        map.set(noteToNullifierKey, value)
      }
    })
  }
}
