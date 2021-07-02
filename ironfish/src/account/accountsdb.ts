/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { FileSystem } from '../fileSystems'
import { IronfishTransaction } from '../primitives/transaction'
import {
  BufferEncoding,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  JsonEncoding,
  StringEncoding,
} from '../storage'
import { createDB } from '../storage/utils'
import { WorkerPool } from '../workerPool'

const DATABASE_VERSION = 1

export type Account = {
  name: string
  spendingKey: string
  incomingViewKey: string
  outgoingViewKey: string
  publicAddress: string
  rescan: number | null
}

export const AccountDefaults: Account = {
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

export type AccountsDBMeta = {
  defaultAccountName: string | null
  headHash: string | null
}

export class AccountsDB {
  database: IDatabase
  workerPool: WorkerPool
  location: string
  files: FileSystem

  accounts: IDatabaseStore<{ key: string; value: Account }>

  meta: IDatabaseStore<{
    key: keyof AccountsDBMeta
    value: AccountsDBMeta[keyof AccountsDBMeta]
  }>

  // Transaction-related database stores
  noteToNullifier: IDatabaseStore<{
    key: string
    value: { nullifierHash: string | null; noteIndex: number | null; spent: boolean }
  }>

  nullifierToNote: IDatabaseStore<{ key: string; value: string }>

  transactions: IDatabaseStore<{
    key: Buffer
    value: {
      transaction: Buffer
      blockHash: string | null
      submittedHeight: number | null
    }
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
      valueEncoding: new JsonEncoding(),
    })

    this.accounts = this.database.addStore<{ key: string; value: Account }>({
      name: 'accounts',
      keyEncoding: new StringEncoding(),
      valueEncoding: new JsonEncoding(),
    })

    this.noteToNullifier = this.database.addStore<{
      key: string
      value: { nullifierHash: string; noteIndex: number | null; spent: boolean }
    }>({
      name: 'noteToNullifier',
      keyEncoding: new StringEncoding(),
      valueEncoding: new JsonEncoding(),
    })

    this.nullifierToNote = this.database.addStore<{ key: string; value: string }>({
      name: 'nullifierToNote',
      keyEncoding: new StringEncoding(),
      valueEncoding: new StringEncoding(),
    })

    this.transactions = this.database.addStore<{
      key: Buffer
      value: {
        transaction: Buffer
        blockHash: string | null
        submittedHeight: number | null
      }
    }>({
      name: 'transactions',
      keyEncoding: new BufferEncoding(),
      valueEncoding: new JsonEncoding(),
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
    await this.accounts.put(account.name, account)
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
      yield account
    }
  }

  async saveTransaction(
    transactionHash: Buffer,
    transaction: {
      transaction: IronfishTransaction
      blockHash: string | null
      submittedHeight: number | null
    },
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const serialized = {
      ...transaction,
      transaction: transaction.transaction.serialize(),
    }
    await this.transactions.put(transactionHash, serialized, tx)
  }

  async replaceTransactions(
    map: BufferMap<{
      transaction: IronfishTransaction
      blockHash: string | null
      submittedHeight: number | null
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
      transaction: IronfishTransaction
      blockHash: string | null
      submittedHeight: number | null
    }>,
  ): Promise<void> {
    for await (const value of this.transactions.getAllValuesIter()) {
      const deserialized = {
        ...value,
        transaction: new IronfishTransaction(value.transaction, this.workerPool),
      }

      map.set(deserialized.transaction.transactionHash(), deserialized)
    }
  }

  async saveNullifierToNote(
    nullifier: string,
    note: string,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.nullifierToNote.put(nullifier, note, tx)
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
