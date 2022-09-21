/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { Assert } from '../../assert'
import { FileSystem } from '../../fileSystems'
import { NoteEncryptedHash } from '../../primitives/noteEncrypted'
import { Nullifier } from '../../primitives/nullifier'
import { TransactionHash } from '../../primitives/transaction'
import {
  BigIntLEEncoding,
  BufferEncoding,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  NullableBufferEncoding,
  PrefixEncoding,
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
    key: Account['id']
    value: Buffer | null
  }>

  balances: IDatabaseStore<{
    key: Account['id']
    value: bigint
  }>

  decryptedNotes: IDatabaseStore<{
    key: [Account['prefix'], NoteEncryptedHash]
    value: DecryptedNoteValue
  }>

  nullifierToNoteHash: IDatabaseStore<{
    key: [Account['prefix'], Nullifier]
    value: Buffer
  }>

  transactions: IDatabaseStore<{
    key: [Account['prefix'], TransactionHash]
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
      name: 'm',
      keyEncoding: new StringEncoding<keyof AccountsDBMeta>(),
      valueEncoding: new MetaValueEncoding(),
    })

    this.headHashes = this.database.addStore({
      name: 'h',
      keyEncoding: new StringEncoding(),
      valueEncoding: new NullableBufferEncoding(),
    })

    this.accounts = this.database.addStore({
      name: 'a',
      keyEncoding: new StringEncoding(),
      valueEncoding: new AccountValueEncoding(),
    })

    this.balances = this.database.addStore({
      name: 'b',
      keyEncoding: new StringEncoding(),
      valueEncoding: new BigIntLEEncoding(),
    })

    this.decryptedNotes = this.database.addStore({
      name: 'd',
      keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
      valueEncoding: new DecryptedNoteValueEncoding(),
    })

    this.nullifierToNoteHash = this.database.addStore({
      name: 'n',
      keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
      valueEncoding: new BufferEncoding(),
    })

    this.transactions = this.database.addStore({
      name: 't',
      keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
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

  async *loadAccounts(tx?: IDatabaseTransaction): AsyncGenerator<AccountValue, void, unknown> {
    for await (const account of this.accounts.getAllValuesIter(tx)) {
      yield account
    }
  }

  async getHeadHash(account: Account, tx?: IDatabaseTransaction): Promise<Buffer | null> {
    const headHash = await this.headHashes.get(account.id, tx)
    Assert.isNotUndefined(headHash)
    return headHash
  }

  async saveHeadHash(
    account: Account,
    headHash: Buffer | null,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.headHashes.put(account.id, headHash, tx)
  }

  async removeHeadHash(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    await this.headHashes.del(account.id, tx)
  }

  async *loadHeadHashes(
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<{ accountId: string; headHash: Buffer | null }, void, unknown> {
    for await (const [accountId, headHash] of this.headHashes.getAllIter(tx)) {
      yield { accountId, headHash }
    }
  }

  async saveTransaction(
    account: Account,
    transactionHash: Buffer,
    transactionValue: TransactionValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.transactions.put([account.prefix, transactionHash], transactionValue, tx)
  }

  async deleteTransaction(
    account: Account,
    transactionHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.transactions.del([account.prefix, transactionHash], tx)
  }

  async clearTransactions(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    await this.transactions.clear(tx, account.prefixRange)
  }

  async *loadTransactions(
    account: Account,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<TransactionValue> {
    for await (const transactionValue of this.transactions.getAllValuesIter(
      tx,
      account.prefixRange,
    )) {
      yield transactionValue
    }
  }

  async loadTransaction(
    account: Account,
    transactionHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<TransactionValue | undefined> {
    return this.transactions.get([account.prefix, transactionHash], tx)
  }

  async loadNoteHash(
    account: Account,
    nullifier: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<Buffer | null> {
    const noteHash = await this.nullifierToNoteHash.get([account.prefix, nullifier], tx)
    return noteHash || null
  }

  async saveNullifierNoteHash(
    account: Account,
    nullifier: Buffer,
    noteHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.nullifierToNoteHash.put([account.prefix, nullifier], noteHash, tx)
  }

  async *loadNullifierToNoteHash(
    account: Account,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<{
    nullifier: Buffer
    noteHash: Buffer
  }> {
    for await (const [[_, nullifier], noteHash] of this.nullifierToNoteHash.getAllIter(
      tx,
      account.prefixRange,
    )) {
      yield {
        nullifier,
        noteHash,
      }
    }
  }

  async deleteNullifier(
    account: Account,
    nullifier: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.nullifierToNoteHash.del([account.prefix, nullifier], tx)
  }

  async clearNullifierToNoteHash(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    await this.nullifierToNoteHash.clear(tx, account.prefixRange)
  }

  async replaceNullifierToNoteHash(
    account: Account,
    map: BufferMap<Buffer>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.database.withTransaction(tx, async (tx) => {
      await this.clearNullifierToNoteHash(account, tx)

      for (const [key, value] of map) {
        await this.nullifierToNoteHash.put([account.prefix, key], value, tx)
      }
    })
  }

  async saveDecryptedNote(
    account: Account,
    noteHash: Buffer,
    note: Readonly<DecryptedNoteValue>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.decryptedNotes.put([account.prefix, noteHash], note, tx)
  }

  async loadDecryptedNote(
    account: Account,
    noteHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<DecryptedNoteValue | undefined> {
    return await this.decryptedNotes.get([account.prefix, noteHash], tx)
  }

  async deleteDecryptedNote(
    account: Account,
    noteHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.decryptedNotes.del([account.prefix, noteHash], tx)
  }

  async clearDecryptedNotes(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    await this.decryptedNotes.clear(tx, account.prefixRange)
  }

  async *loadDecryptedNotes(
    account: Account,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<DecryptedNoteValue & { hash: Buffer }> {
    for await (const [[_, hash], decryptedNote] of this.decryptedNotes.getAllIter(
      tx,
      account.prefixRange,
    )) {
      yield {
        ...decryptedNote,
        hash,
      }
    }
  }

  async getUnconfirmedBalance(account: Account, tx?: IDatabaseTransaction): Promise<bigint> {
    const unconfirmedBalance = await this.balances.get(account.id, tx)
    Assert.isNotUndefined(unconfirmedBalance)
    return unconfirmedBalance
  }

  async saveUnconfirmedBalance(
    account: Account,
    balance: bigint,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.balances.put(account.id, balance, tx)
  }
}
