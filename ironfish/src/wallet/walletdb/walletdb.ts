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
  BUFFER_ENCODING,
  BufferEncoding,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  NULL_ENCODING,
  NullableBufferEncoding,
  PrefixEncoding,
  StringEncoding,
  U32_ENCODING,
} from '../../storage'
import { StorageUtils } from '../../storage/database/utils'
import { createDB } from '../../storage/utils'
import { WorkerPool } from '../../workerPool'
import { Account, calculateAccountPrefix } from '../account'
import { AccountValue, AccountValueEncoding } from './accountValue'
import { DecryptedNoteValue, DecryptedNoteValueEncoding } from './decryptedNoteValue'
import { AccountsDBMeta, MetaValue, MetaValueEncoding } from './metaValue'
import { TransactionValue, TransactionValueEncoding } from './transactionValue'

export const VERSION_DATABASE_ACCOUNTS = 13

const getAccountsDBMetaDefaults = (): AccountsDBMeta => ({
  defaultAccountId: null,
})

export class WalletDB {
  db: IDatabase
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

  sequenceToNoteHash: IDatabaseStore<{
    key: [Account['prefix'], [number, Buffer]]
    value: null
  }>

  nonChainNoteHashes: IDatabaseStore<{
    key: [Account['prefix'], Buffer]
    value: null
  }>

  transactions: IDatabaseStore<{
    key: [Account['prefix'], TransactionHash]
    value: TransactionValue
  }>

  pendingTransactionHashes: IDatabaseStore<{
    key: [Account['prefix'], [number, TransactionHash]]
    value: null
  }>

  accountIdsToCleanup: IDatabaseStore<{
    key: Account['id']
    value: null
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
    this.db = createDB({ location })

    this.meta = this.db.addStore<{
      key: keyof AccountsDBMeta
      value: AccountsDBMeta[keyof AccountsDBMeta]
    }>({
      name: 'm',
      keyEncoding: new StringEncoding<keyof AccountsDBMeta>(),
      valueEncoding: new MetaValueEncoding(),
    })

    this.headHashes = this.db.addStore({
      name: 'h',
      keyEncoding: new StringEncoding(),
      valueEncoding: new NullableBufferEncoding(),
    })

    this.accounts = this.db.addStore({
      name: 'a',
      keyEncoding: new StringEncoding(),
      valueEncoding: new AccountValueEncoding(),
    })

    this.balances = this.db.addStore({
      name: 'b',
      keyEncoding: new StringEncoding(),
      valueEncoding: new BigIntLEEncoding(),
    })

    this.decryptedNotes = this.db.addStore({
      name: 'd',
      keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
      valueEncoding: new DecryptedNoteValueEncoding(),
    })

    this.nullifierToNoteHash = this.db.addStore({
      name: 'n',
      keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
      valueEncoding: new BufferEncoding(),
    })

    this.sequenceToNoteHash = this.db.addStore({
      name: 's',
      keyEncoding: new PrefixEncoding(
        new BufferEncoding(),
        new PrefixEncoding(U32_ENCODING, new BufferEncoding(), 4),
        4,
      ),
      valueEncoding: NULL_ENCODING,
    })

    this.nonChainNoteHashes = this.db.addStore({
      name: 'S',
      keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
      valueEncoding: NULL_ENCODING,
    })

    this.transactions = this.db.addStore({
      name: 't',
      keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
      valueEncoding: new TransactionValueEncoding(),
    })

    this.pendingTransactionHashes = this.db.addStore({
      name: 'p',
      keyEncoding: new PrefixEncoding(
        new BufferEncoding(),
        new PrefixEncoding(U32_ENCODING, new BufferEncoding(), 4),
        4,
      ),
      valueEncoding: NULL_ENCODING,
    })

    this.accountIdsToCleanup = this.db.addStore({
      name: 'A',
      keyEncoding: new StringEncoding(),
      valueEncoding: NULL_ENCODING,
    })
  }

  async open(): Promise<void> {
    await this.files.mkdir(this.location, { recursive: true })
    await this.db.open()
    await this.db.upgrade(VERSION_DATABASE_ACCOUNTS)
  }

  async close(): Promise<void> {
    await this.db.close()
  }

  async setAccount(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    await this.db.withTransaction(tx, async (tx) => {
      await this.accounts.put(account.id, account.serialize(), tx)

      const unconfirmedBalance = await this.balances.get(account.id, tx)
      if (unconfirmedBalance === undefined) {
        await this.saveUnconfirmedBalance(account, BigInt(0), tx)
      }
    })
  }

  async removeAccount(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    await this.db.withTransaction(tx, async (tx) => {
      await this.accounts.del(account.id, tx)
      await this.balances.del(account.id, tx)
      await this.accountIdsToCleanup.put(account.id, null, tx)
    })
  }

  async setDefaultAccount(
    id: AccountsDBMeta['defaultAccountId'],
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.db.withTransaction(tx, async (tx) => {
      await this.meta.put('defaultAccountId', id, tx)
    })
  }

  async loadAccountsMeta(tx?: IDatabaseTransaction): Promise<AccountsDBMeta> {
    const meta = { ...getAccountsDBMetaDefaults() }

    await this.db.withTransaction(tx, async (tx) => {
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

  async clearSequenceToNoteHash(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    await this.sequenceToNoteHash.clear(tx, account.prefixRange)
  }

  async clearNonChainNoteHashes(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    await this.nonChainNoteHashes.clear(tx, account.prefixRange)
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

  async setNoteHashSequence(
    account: Account,
    noteHash: Buffer,
    sequence: number | null,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    if (sequence) {
      await this.sequenceToNoteHash.put([account.prefix, [sequence, noteHash]], null, tx)
      await this.nonChainNoteHashes.del([account.prefix, noteHash], tx)
    } else {
      await this.nonChainNoteHashes.put([account.prefix, noteHash], null, tx)
    }
  }

  async deleteNoteHashSequence(
    account: Account,
    noteHash: Buffer,
    sequence: number | null,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    await this.nonChainNoteHashes.del([account.prefix, noteHash])

    if (sequence !== null) {
      await this.sequenceToNoteHash.del([account.prefix, [sequence, noteHash]], tx)
    }
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
    await this.db.withTransaction(tx, async (tx) => {
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

  async *loadNoteHashesNotOnChain(
    account: Account,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<Buffer> {
    for await (const [, noteHash] of this.nonChainNoteHashes.getAllKeysIter(
      tx,
      account.prefixRange,
    )) {
      yield noteHash
    }
  }

  async *loadNotesNotOnChain(
    account: Account,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<DecryptedNoteValue> {
    for await (const noteHash of this.loadNoteHashesNotOnChain(account, tx)) {
      const note = await this.loadDecryptedNote(account, noteHash, tx)

      if (note) {
        yield note
      }
    }
  }

  async *loadNoteHashesInSequenceRange(
    account: Account,
    start: number,
    end: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<Buffer> {
    const encoding = new PrefixEncoding(
      BUFFER_ENCODING,
      U32_ENCODING,
      account.prefix.byteLength,
    )

    const range = StorageUtils.getPrefixesKeyRange(
      encoding.serialize([account.prefix, start]),
      encoding.serialize([account.prefix, end]),
    )

    for await (const [, [, noteHash]] of this.sequenceToNoteHash.getAllKeysIter(tx, range)) {
      yield noteHash
    }
  }

  async *loadNotesInSequenceRange(
    account: Account,
    start: number,
    end: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<DecryptedNoteValue & { hash: Buffer }> {
    for await (const noteHash of this.loadNoteHashesInSequenceRange(account, start, end, tx)) {
      const note = await this.loadDecryptedNote(account, noteHash, tx)

      if (note) {
        yield { ...note, hash: noteHash }
      }
    }
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

  async *loadExpiredTransactions(
    account: Account,
    headSequence: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<TransactionValue> {
    const encoding = this.pendingTransactionHashes.keyEncoding

    const expiredRange = StorageUtils.getPrefixesKeyRange(
      encoding.serialize([account.prefix, [1, Buffer.alloc(0)]]),
      encoding.serialize([account.prefix, [headSequence, Buffer.alloc(0)]]),
    )

    for await (const [, [, transactionHash]] of this.pendingTransactionHashes.getAllKeysIter(
      tx,
      expiredRange,
    )) {
      const transaction = await this.loadTransaction(account, transactionHash, tx)
      Assert.isNotUndefined(transaction)

      yield transaction
    }
  }

  async *loadPendingTransactions(
    account: Account,
    headSequence: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<TransactionValue> {
    const encoding = this.pendingTransactionHashes.keyEncoding

    const noExpirationRange = StorageUtils.getPrefixKeyRange(
      encoding.serialize([account.prefix, [0, Buffer.alloc(0)]]),
    )

    for await (const [, [, transactionHash]] of this.pendingTransactionHashes.getAllKeysIter(
      tx,
      noExpirationRange,
    )) {
      const transaction = await this.loadTransaction(account, transactionHash, tx)
      Assert.isNotUndefined(transaction)

      yield transaction
    }

    const pendingRange = StorageUtils.getPrefixesKeyRange(
      encoding.serialize([account.prefix, [headSequence + 1, Buffer.alloc(0)]]),
      encoding.serialize([account.prefix, [2 ^ 32, Buffer.alloc(0)]]),
    )

    for await (const [, [, transactionHash]] of this.pendingTransactionHashes.getAllKeysIter(
      tx,
      pendingRange,
    )) {
      const transaction = await this.loadTransaction(account, transactionHash, tx)
      Assert.isNotUndefined(transaction)

      yield transaction
    }
  }

  async savePendingTransactionHash(
    account: Account,
    expirationSequence: number,
    transactionHash: TransactionHash,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.pendingTransactionHashes.put(
      [account.prefix, [expirationSequence, transactionHash]],
      null,
      tx,
    )
  }

  async deletePendingTransactionHash(
    account: Account,
    expirationSequence: number,
    transactionHash: TransactionHash,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.pendingTransactionHashes.del(
      [account.prefix, [expirationSequence, transactionHash]],
      tx,
    )
  }

  async clearPendingTransactionHashes(
    account: Account,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.pendingTransactionHashes.clear(tx, account.prefixRange)
  }

  async cleanupDeletedAccounts(signal?: AbortSignal): Promise<void> {
    let recordsToCleanup = 1000

    const stores: IDatabaseStore<{
      key: Readonly<unknown>
      value: unknown
    }>[] = [
      this.transactions,
      this.sequenceToNoteHash,
      this.nonChainNoteHashes,
      this.nullifierToNoteHash,
      this.pendingTransactionHashes,
      this.decryptedNotes,
    ]

    for (const [accountId] of await this.accountIdsToCleanup.getAll()) {
      const prefix = calculateAccountPrefix(accountId)
      const range = StorageUtils.getPrefixKeyRange(prefix)

      for (const store of stores) {
        for await (const key of store.getAllKeysIter(undefined, range)) {
          if (signal?.aborted === true || recordsToCleanup === 0) {
            return
          }

          await store.del(key)
          recordsToCleanup--
        }
      }

      await this.accountIdsToCleanup.del(accountId)
    }
  }
}
