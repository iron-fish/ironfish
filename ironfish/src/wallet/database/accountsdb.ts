/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { Assert } from '../../assert'
import { FileSystem } from '../../fileSystems'
import { Transaction } from '../../primitives/transaction'
import {
  BigIntLEEncoding,
  BufferEncoding,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  NullableStringEncoding,
  StringEncoding,
} from '../../storage'
import { createDB } from '../../storage/utils'
import { WorkerPool } from '../../workerPool'
import { Account } from '../account'
import { AccountValue, AccountValueEncoding } from './accountValue'
import { DecryptedNoteValue, DecryptedNoteValueEncoding } from './decryptedNoteValue'
import { AccountsDBMeta, MetaValue, MetaValueEncoding } from './metaValue'
import { TransactionValue, TransactionValueEncoding } from './transactionValue'

export const VERSION_DATABASE_ACCOUNTS = 13

const getAccountsDBMetaDefaults = (): AccountsDBMeta => ({
  defaultAccountId: null,
})

export class AccountsDB {
  database: IDatabase
  workerPool: WorkerPool
  location: string
  files: FileSystem

  accounts: IDatabaseStore<{ key: string; value: AccountValue }>

  meta: IDatabaseStore<{
    key: keyof AccountsDBMeta
    value: MetaValue
  }>

  headHashes: IDatabaseStore<{
    key: string
    value: string | null
  }>

  balances: IDatabaseStore<{
    key: string
    value: bigint
  }>

  decryptedNotes: IDatabaseStore<{
    key: Buffer
    value: DecryptedNoteValue
  }>

  nullifierToNoteHash: IDatabaseStore<{ key: Buffer; value: Buffer }>

  transactions: IDatabaseStore<{
    key: Buffer
    value: TransactionValue
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

    this.headHashes = this.database.addStore<{
      key: string
      value: string | null
    }>({
      name: 'headHashes',
      keyEncoding: new StringEncoding(),
      valueEncoding: new NullableStringEncoding(),
    })

    this.accounts = this.database.addStore<{ key: string; value: AccountValue }>({
      name: 'accounts',
      keyEncoding: new StringEncoding(),
      valueEncoding: new AccountValueEncoding(),
    })

    this.balances = this.database.addStore<{ key: string; value: bigint }>({
      name: 'balances',
      keyEncoding: new StringEncoding(),
      valueEncoding: new BigIntLEEncoding(),
    })

    this.decryptedNotes = this.database.addStore<{
      key: Buffer
      value: DecryptedNoteValue
    }>({
      name: 'decryptedNotes',
      keyEncoding: new BufferEncoding(),
      valueEncoding: new DecryptedNoteValueEncoding(),
    })

    this.nullifierToNoteHash = this.database.addStore<{ key: Buffer; value: Buffer }>({
      name: 'nullifierToNoteHash',
      keyEncoding: new BufferEncoding(),
      valueEncoding: new BufferEncoding(),
    })

    this.transactions = this.database.addStore<{
      key: Buffer
      value: TransactionValue
    }>({
      name: 'transactions',
      keyEncoding: new BufferEncoding(),
      valueEncoding: new TransactionValueEncoding(),
    })
  }

  async open(): Promise<void> {
    await this.files.mkdir(this.location, { recursive: true })
    await this.database.open()
    await this.database.upgrade(VERSION_DATABASE_ACCOUNTS)
  }

  async close(): Promise<void> {
    await this.database.close()
  }

  async setAccount(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    await this.database.withTransaction(tx, async (tx) => {
      await this.accounts.put(account.id, account.serialize(), tx)

      const unconfirmedBalance = await this.balances.get(account.id, tx)
      if (unconfirmedBalance === undefined) {
        await this.saveUnconfirmedBalance(account, BigInt(0), tx)
      }
    })
  }

  async removeAccount(id: string, tx?: IDatabaseTransaction): Promise<void> {
    await this.database.withTransaction(tx, async (tx) => {
      await this.accounts.del(id, tx)
    })
  }

  async setDefaultAccount(
    id: AccountsDBMeta['defaultAccountId'],
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.database.withTransaction(tx, async (tx) => {
      await this.meta.put('defaultAccountId', id, tx)
    })
  }

  async loadAccountsMeta(tx?: IDatabaseTransaction): Promise<AccountsDBMeta> {
    const meta = { ...getAccountsDBMetaDefaults() }

    await this.database.withTransaction(tx, async (tx) => {
      for await (const [key, value] of this.meta.getAllIter(tx)) {
        meta[key] = value
      }
    })

    return meta
  }

  async *loadAccounts(
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<{ id: string; serializedAccount: AccountValue }, void, unknown> {
    for await (const [id, serializedAccount] of this.accounts.getAllIter(tx)) {
      yield { id, serializedAccount }
    }
  }

  async getHeadHash(account: Account, tx?: IDatabaseTransaction): Promise<string | null> {
    return await this.database.withTransaction(tx, async (tx) => {
      const headHash = await this.headHashes.get(account.id, tx)
      Assert.isNotUndefined(headHash)
      return headHash
    })
  }

  async saveHeadHash(
    account: Account,
    headHash: string | null,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.database.withTransaction(tx, async (tx) => {
      await this.headHashes.put(account.id, headHash, tx)
    })
  }

  async removeHeadHash(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    await this.database.withTransaction(tx, async (tx) => {
      await this.headHashes.del(account.id, tx)
    })
  }

  async removeHeadHashes(tx?: IDatabaseTransaction): Promise<void> {
    await this.database.withTransaction(tx, async (tx) => {
      await this.headHashes.clear(tx)
    })
  }

  async *loadHeadHashes(
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<{ accountId: string; headHash: string | null }, void, unknown> {
    for await (const [accountId, headHash] of this.headHashes.getAllIter(tx)) {
      yield { accountId, headHash }
    }
  }

  async saveTransaction(
    transactionHash: Buffer,
    transaction: {
      transaction: Transaction
      blockHash: Buffer | null
      sequence: number | null
      submittedSequence: number | null
    },
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const serialized = {
      ...transaction,
      transaction: transaction.transaction.serialize(),
    }
    await this.database.withTransaction(tx, async (tx) => {
      await this.transactions.put(transactionHash, serialized, tx)
    })
  }

  async deleteTransaction(transactionHash: Buffer, tx?: IDatabaseTransaction): Promise<void> {
    await this.database.withTransaction(tx, async (tx) => {
      await this.transactions.del(transactionHash, tx)
    })
  }

  async replaceTransactions(
    map: BufferMap<{
      transaction: Transaction
      blockHash: Buffer | null
      sequence: number | null
      submittedSequence: number | null
    }>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.database.withTransaction(tx, async (tx) => {
      await this.transactions.clear(tx)

      for (const [key, value] of map) {
        const serialized = {
          ...value,
          transaction: value.transaction.serialize(),
        }

        await this.transactions.put(key, serialized, tx)
      }
    })
  }

  async *loadTransactions(tx?: IDatabaseTransaction): AsyncGenerator<{
    hash: Buffer
    transaction: {
      transaction: Transaction
      blockHash: Buffer | null
      sequence: number | null
      submittedSequence: number | null
    }
  }> {
    for await (const [hash, value] of this.transactions.getAllIter(tx)) {
      yield {
        hash,
        transaction: {
          ...value,
          transaction: new Transaction(value.transaction),
        },
      }
    }
  }

  async loadTransaction(
    transactionHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<
    | {
        transaction: Transaction
        blockHash: Buffer | null
        sequence: number | null
        submittedSequence: number | null
      }
    | undefined
  > {
    const transactionValue = await this.transactions.get(transactionHash, tx)

    if (transactionValue) {
      return {
        ...transactionValue,
        transaction: new Transaction(transactionValue.transaction),
      }
    }
  }

  async saveNullifierNoteHash(
    nullifier: Buffer,
    noteHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.database.withTransaction(tx, async (tx) => {
      await this.nullifierToNoteHash.put(nullifier, noteHash, tx)
    })
  }

  async deleteNullifier(nullifier: Buffer, tx?: IDatabaseTransaction): Promise<void> {
    await this.database.withTransaction(tx, async (tx) => {
      await this.nullifierToNoteHash.del(nullifier, tx)
    })
  }

  async replaceNullifierToNoteHash(
    map: BufferMap<Buffer>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.database.withTransaction(tx, async (tx) => {
      await this.nullifierToNoteHash.clear(tx)

      for (const [key, value] of map) {
        await this.nullifierToNoteHash.put(key, value, tx)
      }
    })
  }

  async saveDecryptedNote(
    noteHash: Buffer,
    note: Readonly<DecryptedNoteValue>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.database.withTransaction(tx, async (tx) => {
      await this.decryptedNotes.put(noteHash, note, tx)
    })
  }

  async deleteDecryptedNote(noteHash: Buffer, tx?: IDatabaseTransaction): Promise<void> {
    await this.database.withTransaction(tx, async (tx) => {
      await this.decryptedNotes.del(noteHash, tx)
    })
  }

  async replaceDecryptedNotes(
    map: BufferMap<DecryptedNoteValue>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.database.withTransaction(tx, async (tx) => {
      await this.decryptedNotes.clear(tx)

      for (const [key, value] of map) {
        await this.decryptedNotes.put(key, value, tx)
      }
    })
  }

  async *loadDecryptedNotes(tx?: IDatabaseTransaction): AsyncGenerator<{
    hash: Buffer
    decryptedNote: DecryptedNoteValue
  }> {
    for await (const [hash, decryptedNote] of this.decryptedNotes.getAllIter(tx)) {
      yield {
        hash,
        decryptedNote,
      }
    }
  }

  async getUnconfirmedBalance(account: Account, tx?: IDatabaseTransaction): Promise<bigint> {
    return await this.database.withTransaction(tx, async (tx) => {
      const unconfirmedBalance = await this.balances.get(account.id, tx)
      Assert.isNotUndefined(unconfirmedBalance)
      return unconfirmedBalance
    })
  }

  async saveUnconfirmedBalance(
    account: Account,
    balance: bigint,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.database.withTransaction(tx, async (tx) => {
      await this.balances.put(account.id, balance, tx)
    })
  }
}
