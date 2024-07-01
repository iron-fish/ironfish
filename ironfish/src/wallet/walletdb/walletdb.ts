/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../../assert'
import { FileSystem } from '../../fileSystems'
import { GENESIS_BLOCK_PREVIOUS } from '../../primitives/block'
import { NoteEncryptedHash } from '../../primitives/noteEncrypted'
import { Nullifier } from '../../primitives/nullifier'
import { Transaction, TransactionHash } from '../../primitives/transaction'
import {
  BIG_U64_BE_ENCODING,
  BigU64BEEncoding,
  BUFFER_ENCODING,
  BufferEncoding,
  DatabaseKeyRange,
  DatabaseSchema,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  NULL_ENCODING,
  PrefixArrayEncoding,
  PrefixEncoding,
  StringEncoding,
  U32_ENCODING_BE,
  U64_ENCODING,
} from '../../storage'
import { getPrefixesKeyRange, StorageUtils } from '../../storage/database/utils'
import { createDB } from '../../storage/utils'
import { BufferUtils } from '../../utils'
import { WorkerPool } from '../../workerPool'
import { Account, calculateAccountPrefix } from '../account/account'
import { AccountValue, AccountValueEncoding } from './accountValue'
import { AssetValue, AssetValueEncoding } from './assetValue'
import { BalanceValue, BalanceValueEncoding } from './balanceValue'
import { DecryptedNoteValue, DecryptedNoteValueEncoding } from './decryptedNoteValue'
import { HeadValue, NullableHeadValueEncoding } from './headValue'
import { AccountsDBMeta, MetaValue, MetaValueEncoding } from './metaValue'
import { MultisigSecretValue, MultisigSecretValueEncoding } from './multisigSecretValue'
import { ParticipantIdentity, ParticipantIdentityEncoding } from './participantIdentity'
import { TransactionValue, TransactionValueEncoding } from './transactionValue'

const VERSION_DATABASE_ACCOUNTS = 32

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

  heads: IDatabaseStore<{
    key: Account['id']
    value: HeadValue | null
  }>

  balances: IDatabaseStore<{
    key: [Account['prefix'], Buffer]
    value: BalanceValue
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

  sequenceToTransactionHash: IDatabaseStore<{
    key: [Account['prefix'], [number, Buffer]]
    value: null
  }>

  pendingTransactionHashes: IDatabaseStore<{
    key: [Account['prefix'], [number, TransactionHash]]
    value: null
  }>

  accountIdsToCleanup: IDatabaseStore<{
    key: Account['id']
    value: null
  }>

  timestampToTransactionHash: IDatabaseStore<{
    key: [Account['prefix'], [number, TransactionHash]]
    value: null
  }>

  assets: IDatabaseStore<{
    key: [Account['prefix'], Buffer]
    value: AssetValue
  }>

  nullifierToTransactionHash: IDatabaseStore<{
    key: [Account['prefix'], Buffer]
    value: TransactionHash
  }>

  unspentNoteHashes: IDatabaseStore<{
    key: [Account['prefix'], Buffer, number, bigint, Buffer]
    value: null
  }>

  valueToUnspentNoteHashes: IDatabaseStore<{
    key: [Account['prefix'], Buffer, bigint, Buffer] // account prefix, asset ID, value, note hash
    value: null
  }>

  multisigSecrets: IDatabaseStore<{
    key: Buffer
    value: MultisigSecretValue
  }>

  participantIdentities: IDatabaseStore<{
    key: [Account['prefix'], Buffer]
    value: ParticipantIdentity
  }>

  cacheStores: Array<IDatabaseStore<DatabaseSchema>>

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

    this.heads = this.db.addStore({
      name: 'h',
      keyEncoding: new StringEncoding(),
      valueEncoding: new NullableHeadValueEncoding(),
    })

    this.accounts = this.db.addStore({
      name: 'a',
      keyEncoding: new StringEncoding(),
      valueEncoding: new AccountValueEncoding(),
    })

    this.balances = this.db.addStore({
      name: 'b',
      keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
      valueEncoding: new BalanceValueEncoding(),
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
      name: 'SN',
      keyEncoding: new PrefixEncoding(
        new BufferEncoding(),
        new PrefixEncoding(U32_ENCODING_BE, new BufferEncoding(), 4),
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

    this.sequenceToTransactionHash = this.db.addStore({
      name: 'ST',
      keyEncoding: new PrefixEncoding(
        new BufferEncoding(),
        new PrefixEncoding(U32_ENCODING_BE, new BufferEncoding(), 4),
        4,
      ),
      valueEncoding: NULL_ENCODING,
    })

    this.pendingTransactionHashes = this.db.addStore({
      name: 'PT',
      keyEncoding: new PrefixEncoding(
        new BufferEncoding(),
        new PrefixEncoding(U32_ENCODING_BE, new BufferEncoding(), 4),
        4,
      ),
      valueEncoding: NULL_ENCODING,
    })

    this.accountIdsToCleanup = this.db.addStore({
      name: 'A',
      keyEncoding: new StringEncoding(),
      valueEncoding: NULL_ENCODING,
    })

    this.timestampToTransactionHash = this.db.addStore({
      name: 'TT',
      keyEncoding: new PrefixEncoding(
        new BufferEncoding(),
        new PrefixEncoding(U64_ENCODING, new BufferEncoding(), 8),
        4,
      ),
      valueEncoding: NULL_ENCODING,
    })

    this.assets = this.db.addStore({
      name: 'as',
      keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
      valueEncoding: new AssetValueEncoding(),
    })

    this.nullifierToTransactionHash = this.db.addStore({
      name: 'nt',
      keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
      valueEncoding: new BufferEncoding(),
    })

    this.unspentNoteHashes = this.db.addStore({
      name: 'un',
      keyEncoding: new PrefixArrayEncoding([
        [new BufferEncoding(), 4], // account prefix
        [new BufferEncoding(), 32], // asset ID
        [U32_ENCODING_BE, 4], // sequence
        [new BigU64BEEncoding(), 8], // value
        [new BufferEncoding(), 32], // note hash
      ]),
      valueEncoding: NULL_ENCODING,
    })

    this.valueToUnspentNoteHashes = this.db.addStore({
      name: 'valueToUnspentNoteHashes',
      keyEncoding: new PrefixArrayEncoding([
        [new BufferEncoding(), 4], // account prefix
        [new BufferEncoding(), 32], // asset ID
        [new BigU64BEEncoding(), 8], // value
        [new BufferEncoding(), 32], // note hash
      ]),
      valueEncoding: NULL_ENCODING,
    })

    this.multisigSecrets = this.db.addStore({
      name: 'ms',
      keyEncoding: new BufferEncoding(),
      valueEncoding: new MultisigSecretValueEncoding(),
    })

    this.participantIdentities = this.db.addStore({
      name: 'pi',
      keyEncoding: new PrefixEncoding(
        new BufferEncoding(), // account prefix
        new BufferEncoding(), // participant identifier
        4,
      ),
      valueEncoding: new ParticipantIdentityEncoding(),
    })

    // IDatabaseStores that cache and index decrypted chain data
    this.cacheStores = [
      this.decryptedNotes,
      this.nullifierToNoteHash,
      this.sequenceToNoteHash,
      this.nonChainNoteHashes,
      this.transactions,
      this.sequenceToTransactionHash,
      this.pendingTransactionHashes,
      this.timestampToTransactionHash,
      this.assets,
      this.nullifierToTransactionHash,
      this.unspentNoteHashes,
      this.valueToUnspentNoteHashes,
    ]
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

      const nativeUnconfirmedBalance = await this.balances.get(
        [account.prefix, Asset.nativeId()],
        tx,
      )
      if (nativeUnconfirmedBalance === undefined) {
        await this.saveUnconfirmedBalance(
          account,
          Asset.nativeId(),
          {
            unconfirmed: 0n,
            blockHash: null,
            sequence: null,
          },
          tx,
        )
      }
    })
  }

  async removeAccount(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    await this.db.withTransaction(tx, async (tx) => {
      await this.accounts.del(account.id, tx)
      await this.clearBalance(account, tx)
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

  async getHead(account: Account, tx?: IDatabaseTransaction): Promise<HeadValue | null> {
    const head = await this.heads.get(account.id, tx)
    Assert.isNotUndefined(head)
    return head
  }

  async saveHead(
    account: Account,
    head: HeadValue | null,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.heads.put(account.id, head, tx)
  }

  async removeHead(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    await this.heads.del(account.id, tx)
  }

  async *loadHeads(
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<{ accountId: string; head: HeadValue | null }, void, unknown> {
    for await (const [accountId, head] of this.heads.getAllIter(tx)) {
      yield { accountId, head }
    }
  }

  async saveTransaction(
    account: Account,
    transactionHash: Buffer,
    transactionValue: TransactionValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const expiration = transactionValue.transaction.expiration()

    await this.db.withTransaction(tx, async (tx) => {
      if (transactionValue.sequence !== null) {
        await this.pendingTransactionHashes.del(
          [account.prefix, [expiration, transactionHash]],
          tx,
        )

        await this.sequenceToTransactionHash.put(
          [account.prefix, [transactionValue.sequence, transactionHash]],
          null,
          tx,
        )
      } else {
        await this.pendingTransactionHashes.put(
          [account.prefix, [expiration, transactionHash]],
          null,
          tx,
        )
      }

      await this.transactions.put([account.prefix, transactionHash], transactionValue, tx)
      await this.timestampToTransactionHash.put(
        [account.prefix, [transactionValue.timestamp.getTime(), transactionHash]],
        null,
        tx,
      )
    })
  }

  async deleteTransaction(
    account: Account,
    transactionHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const transaction = await this.loadTransaction(account, transactionHash, tx)
    Assert.isNotUndefined(transaction)

    await this.timestampToTransactionHash.del(
      [account.prefix, [transaction.timestamp.getTime(), transactionHash]],
      tx,
    )
    await this.transactions.del([account.prefix, transactionHash], tx)
  }

  async clearTransactions(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    await this.transactions.clear(tx, account.prefixRange)
    await this.timestampToTransactionHash.clear(tx, account.prefixRange)
  }

  async clearSequenceToNoteHash(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    await this.sequenceToNoteHash.clear(tx, account.prefixRange)
  }

  async clearNonChainNoteHashes(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    await this.nonChainNoteHashes.clear(tx, account.prefixRange)
  }

  async *getTransactionHashesBySequence(
    account: Account,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<{ sequence: number; hash: Buffer }> {
    for await (const [, [sequence, hash]] of this.sequenceToTransactionHash.getAllKeysIter(
      tx,
      account.prefixRange,
      { ordered: true },
    )) {
      yield { sequence, hash }
    }
  }

  async *loadTransactions(
    account: Account,
    range?: DatabaseKeyRange,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<TransactionValue> {
    const gte = BufferUtils.maxNullable(account.prefixRange.gte, range?.gte)
    const lt = BufferUtils.minNullable(account.prefixRange.lt, range?.lt)

    for await (const transactionValue of this.transactions.getAllValuesIter(tx, { gte, lt })) {
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

  async hasTransaction(
    account: Account,
    transactionHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<boolean> {
    return this.transactions.has([account.prefix, transactionHash], tx)
  }

  async hasPendingTransaction(
    account: Account,
    transactionHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<boolean> {
    const transactionValue = await this.transactions.get([account.prefix, transactionHash], tx)

    if (transactionValue === undefined) {
      return false
    }

    const expiration = transactionValue.transaction.expiration()
    return this.pendingTransactionHashes.has(
      [account.prefix, [expiration, transactionHash]],
      tx,
    )
  }

  async setNoteHashSequence(
    account: Account,
    noteHash: Buffer,
    sequence: number | null,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.db.withTransaction(tx, async (tx) => {
      if (sequence) {
        await this.sequenceToNoteHash.put([account.prefix, [sequence, noteHash]], null, tx)
        await this.nonChainNoteHashes.del([account.prefix, noteHash], tx)
      } else {
        await this.nonChainNoteHashes.put([account.prefix, noteHash], null, tx)
      }
    })
  }

  async disconnectNoteHashSequence(
    account: Account,
    noteHash: Buffer,
    sequence: number,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.db.withTransaction(tx, async (tx) => {
      await this.sequenceToNoteHash.del([account.prefix, [sequence, noteHash]], tx)
      await this.nonChainNoteHashes.put([account.prefix, noteHash], null, tx)
    })
  }

  async deleteNoteHashSequence(
    account: Account,
    noteHash: Buffer,
    sequence: number | null,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.db.withTransaction(tx, async (tx) => {
      await this.nonChainNoteHashes.del([account.prefix, noteHash], tx)

      if (sequence !== null) {
        await this.sequenceToNoteHash.del([account.prefix, [sequence, noteHash]], tx)
      }
    })
  }

  /*
   * clears sequenceToNoteHash entries for all accounts for a given sequence
   */
  async clearSequenceNoteHashes(sequence: number, tx?: IDatabaseTransaction): Promise<void> {
    const encoding = this.sequenceToNoteHash.keyEncoding

    const keyRange = StorageUtils.getPrefixesKeyRange(
      encoding.serialize([Buffer.alloc(4, 0), [sequence, Buffer.alloc(0)]]),
      encoding.serialize([Buffer.alloc(4, 255), [sequence, Buffer.alloc(0)]]),
    )

    await this.sequenceToNoteHash.clear(tx, keyRange)
  }

  async addUnspentNoteHash(
    account: Account,
    noteHash: Buffer,
    decryptedNote: DecryptedNoteValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const sequence = decryptedNote.sequence

    if (sequence === null) {
      return
    }

    const assetId = decryptedNote.note.assetId()
    const value = decryptedNote.note.value()

    await this.unspentNoteHashes.put(
      [account.prefix, assetId, sequence, value, noteHash],
      null,
      tx,
    )

    await this.valueToUnspentNoteHashes.put(
      [account.prefix, assetId, value, noteHash],
      null,
      tx,
    )
  }

  async deleteUnspentNoteHash(
    account: Account,
    noteHash: Buffer,
    decryptedNote: DecryptedNoteValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const assetId = decryptedNote.note.assetId()
    const sequence = decryptedNote.sequence
    const value = decryptedNote.note.value()

    Assert.isNotNull(sequence, 'Cannot spend a note that is not on the chain.')

    await this.unspentNoteHashes.del([account.prefix, assetId, sequence, value, noteHash], tx)

    await this.valueToUnspentNoteHashes.del([account.prefix, assetId, value, noteHash], tx)
  }

  async *loadValueToUnspentNoteHashes(
    account: Account,
    assetId: Buffer,
    reverse = false,
    start = 0n,
    end = 2n ** 64n - 1n,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<Buffer> {
    const encoding = new PrefixEncoding(
      BUFFER_ENCODING,
      new PrefixEncoding(BUFFER_ENCODING, BIG_U64_BE_ENCODING, 32),
      4,
    )

    const range = getPrefixesKeyRange(
      encoding.serialize([account.prefix, [assetId, start]]),
      encoding.serialize([account.prefix, [assetId, end]]),
    )

    for await (const [, , , noteHash] of this.valueToUnspentNoteHashes.getAllKeysIter(
      tx,
      range,
      {
        reverse: reverse,
      },
    )) {
      yield noteHash
    }
  }

  async *loadUnspentNoteHashes(
    account: Account,
    assetId: Buffer,
    sequence?: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<Buffer> {
    const encoding = new PrefixEncoding(
      BUFFER_ENCODING,
      new PrefixEncoding(BUFFER_ENCODING, U32_ENCODING_BE, 32),
      4,
    )

    const maxConfirmedSequence = sequence ?? 2 ** 32 - 1

    const range = getPrefixesKeyRange(
      encoding.serialize([account.prefix, [assetId, 1]]),
      encoding.serialize([account.prefix, [assetId, maxConfirmedSequence]]),
    )

    for await (const [, , , , noteHash] of this.unspentNoteHashes.getAllKeysIter(tx, range)) {
      yield noteHash
    }
  }

  async *loadUnspentNotes(
    account: Account,
    assetId: Buffer,
    sequence?: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<DecryptedNoteValue> {
    for await (const noteHash of this.loadUnspentNoteHashes(account, assetId, sequence, tx)) {
      const decryptedNote = await this.decryptedNotes.get([account.prefix, noteHash], tx)

      if (decryptedNote !== undefined) {
        yield decryptedNote
      }
    }
  }

  async *loadUnspentNoteValues(
    account: Account,
    assetId: Buffer,
    sequence?: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<bigint> {
    const encoding = new PrefixEncoding(
      BUFFER_ENCODING,
      new PrefixEncoding(BUFFER_ENCODING, U32_ENCODING_BE, 32),
      4,
    )

    const maxConfirmedSequence = sequence ?? 2 ** 32 - 1

    const range = getPrefixesKeyRange(
      encoding.serialize([account.prefix, [assetId, 1]]),
      encoding.serialize([account.prefix, [assetId, maxConfirmedSequence]]),
    )

    for await (const [, , , value, _] of this.unspentNoteHashes.getAllKeysIter(tx, range)) {
      yield value
    }
  }

  async loadNoteHash(
    account: Account,
    nullifier: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<Buffer | undefined> {
    return this.nullifierToNoteHash.get([account.prefix, nullifier], tx)
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

  async saveDecryptedNote(
    account: Account,
    noteHash: Buffer,
    note: Readonly<DecryptedNoteValue>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.db.withTransaction(tx, async (tx) => {
      if (note.nullifier) {
        await this.nullifierToNoteHash.put([account.prefix, note.nullifier], noteHash, tx)
      }

      await this.setNoteHashSequence(account, noteHash, note.sequence, tx)

      await this.decryptedNotes.put([account.prefix, noteHash], note, tx)
    })
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
      U32_ENCODING_BE,
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

  async *loadTransactionHashesInSequenceRange(
    account: Account,
    start: number,
    end: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<Buffer> {
    const encoding = new PrefixEncoding(
      BUFFER_ENCODING,
      U32_ENCODING_BE,
      account.prefix.byteLength,
    )

    const range = StorageUtils.getPrefixesKeyRange(
      encoding.serialize([account.prefix, start]),
      encoding.serialize([account.prefix, end]),
    )

    for await (const [, [, transactionHash]] of this.sequenceToTransactionHash.getAllKeysIter(
      tx,
      range,
    )) {
      yield transactionHash
    }
  }

  async *loadTransactionsInSequenceRange(
    account: Account,
    start: number,
    end: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<TransactionValue & { hash: Buffer }> {
    for await (const transactionHash of this.loadTransactionHashesInSequenceRange(
      account,
      start,
      end,
      tx,
    )) {
      const transaction = await this.loadTransaction(account, transactionHash, tx)

      if (transaction) {
        yield { ...transaction, hash: transactionHash }
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
    range?: DatabaseKeyRange,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<DecryptedNoteValue & { hash: Buffer }> {
    const gte = BufferUtils.maxNullable(account.prefixRange.gte, range?.gte)
    const lt = BufferUtils.minNullable(account.prefixRange.lt, range?.lt)

    for await (const [key, decryptedNote] of this.decryptedNotes.getAllIter(tx, {
      gte,
      lt,
    })) {
      const [, hash] = key
      yield {
        ...decryptedNote,
        hash,
      }
    }
  }

  async getUnconfirmedBalance(
    account: Account,
    assetId: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<BalanceValue> {
    const unconfirmedBalance = await this.balances.get([account.prefix, assetId], tx)

    return (
      unconfirmedBalance ?? {
        unconfirmed: 0n,
        blockHash: null,
        sequence: null,
      }
    )
  }

  async *getUnconfirmedBalances(
    account: Account,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<{ assetId: Buffer; balance: BalanceValue }> {
    for await (const [[_, assetId], balance] of this.balances.getAllIter(
      tx,
      account.prefixRange,
    )) {
      yield { assetId, balance }
    }
  }

  async saveUnconfirmedBalance(
    account: Account,
    assetId: Buffer,
    balance: BalanceValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.balances.put([account.prefix, assetId], balance, tx)
  }

  async clearBalance(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    await this.balances.clear(tx, account.prefixRange)
  }

  async *loadExpiredTransactionHashes(
    account: Account,
    headSequence: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<Buffer> {
    const encoding = this.pendingTransactionHashes.keyEncoding

    const expiredRange = StorageUtils.getPrefixesKeyRange(
      encoding.serialize([account.prefix, [1, Buffer.alloc(0)]]),
      encoding.serialize([account.prefix, [headSequence, Buffer.alloc(0)]]),
    )

    for await (const [, [, transactionHash]] of this.pendingTransactionHashes.getAllKeysIter(
      tx,
      expiredRange,
    )) {
      yield transactionHash
    }
  }

  async *loadExpiredTransactions(
    account: Account,
    headSequence: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<TransactionValue> {
    for await (const transactionHash of this.loadExpiredTransactionHashes(
      account,
      headSequence,
      tx,
    )) {
      const transaction = await this.loadTransaction(account, transactionHash, tx)
      Assert.isNotUndefined(transaction)

      yield transaction
    }
  }

  async *loadPendingTransactionHashes(
    account: Account,
    headSequence: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<Buffer> {
    const encoding = this.pendingTransactionHashes.keyEncoding

    const noExpirationRange = StorageUtils.getPrefixKeyRange(
      encoding.serialize([account.prefix, [0, Buffer.alloc(0)]]),
    )

    for await (const [, [, transactionHash]] of this.pendingTransactionHashes.getAllKeysIter(
      tx,
      noExpirationRange,
    )) {
      yield transactionHash
    }

    const pendingRange = StorageUtils.getPrefixesKeyRange(
      encoding.serialize([account.prefix, [headSequence + 1, Buffer.alloc(0)]]),
      encoding.serialize([account.prefix, [2 ** 32 - 1, Buffer.alloc(0)]]),
    )

    for await (const [, [, transactionHash]] of this.pendingTransactionHashes.getAllKeysIter(
      tx,
      pendingRange,
    )) {
      yield transactionHash
    }
  }

  async *loadPendingTransactions(
    account: Account,
    headSequence: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<TransactionValue> {
    for await (const transactionHash of this.loadPendingTransactionHashes(
      account,
      headSequence,
      tx,
    )) {
      const transaction = await this.loadTransaction(account, transactionHash, tx)
      Assert.isNotUndefined(transaction)

      yield transaction
    }
  }

  async saveSequenceToTransactionHash(
    account: Account,
    sequence: number,
    transactionHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.sequenceToTransactionHash.put(
      [account.prefix, [sequence, transactionHash]],
      null,
      tx,
    )
  }

  async deleteSequenceToTransactionHash(
    account: Account,
    sequence: number,
    transactionHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.sequenceToTransactionHash.del([account.prefix, [sequence, transactionHash]], tx)
  }

  async savePendingTransactionHash(
    account: Account,
    expiration: number,
    transactionHash: TransactionHash,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.pendingTransactionHashes.put(
      [account.prefix, [expiration, transactionHash]],
      null,
      tx,
    )
  }

  async deletePendingTransactionHash(
    account: Account,
    expiration: number,
    transactionHash: TransactionHash,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.pendingTransactionHashes.del([account.prefix, [expiration, transactionHash]], tx)
  }

  async clearPendingTransactionHashes(
    account: Account,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.pendingTransactionHashes.clear(tx, account.prefixRange)
  }

  async forceCleanupDeletedAccounts(signal?: AbortSignal): Promise<void> {
    return this.cleanupDeletedAccounts(Number.POSITIVE_INFINITY, signal)
  }

  async cleanupDeletedAccounts(recordsToCleanup: number, signal?: AbortSignal): Promise<void> {
    for (const [accountId] of await this.accountIdsToCleanup.getAll()) {
      const prefix = calculateAccountPrefix(accountId)
      const range = StorageUtils.getPrefixKeyRange(prefix)

      for (const store of this.cacheStores) {
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

  async *loadTransactionsByTime(
    account: Account,
    tx?: IDatabaseTransaction,
    options?: {
      reverse?: boolean
    },
  ): AsyncGenerator<TransactionValue> {
    for await (const [, [, transactionHash]] of this.timestampToTransactionHash.getAllKeysIter(
      tx,
      account.prefixRange,
      {
        ordered: true,
        reverse: options?.reverse ?? true,
      },
    )) {
      const transaction = await this.loadTransaction(account, transactionHash, tx)
      Assert.isNotUndefined(transaction)

      yield transaction
    }
  }

  async putAsset(
    account: Account,
    assetId: Buffer,
    assetValue: AssetValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.assets.put([account.prefix, assetId], assetValue, tx)
  }

  async getAsset(
    account: Account,
    assetId: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<AssetValue | undefined> {
    if (assetId.equals(Asset.nativeId())) {
      return this.nativeAssetValue()
    }
    return this.assets.get([account.prefix, assetId], tx)
  }

  async *loadAssets(account: Account, tx?: IDatabaseTransaction): AsyncGenerator<AssetValue> {
    yield this.nativeAssetValue()

    for await (const asset of this.assets.getAllValuesIter(tx, account.prefixRange, {
      ordered: true,
    })) {
      yield asset
    }
  }

  private nativeAssetValue(): AssetValue {
    return {
      createdTransactionHash: GENESIS_BLOCK_PREVIOUS,
      id: Asset.nativeId(),
      metadata: Buffer.from('Native asset of Iron Fish blockchain', 'utf8'),
      name: Buffer.from('$IRON', 'utf8'),
      nonce: 0,
      creator: Buffer.from('Iron Fish', 'utf8'),
      owner: Buffer.from('Iron Fish', 'utf8'),
      blockHash: null,
      sequence: null,
      supply: null,
    }
  }

  async deleteAsset(
    account: Account,
    assetId: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.assets.del([account.prefix, assetId], tx)
  }

  async getTransactionHashFromNullifier(
    account: Account,
    nullifier: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<Buffer | undefined> {
    return this.nullifierToTransactionHash.get([account.prefix, nullifier], tx)
  }

  async saveNullifierToTransactionHash(
    account: Account,
    nullifier: Buffer,
    transaction: Transaction,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.nullifierToTransactionHash.put(
      [account.prefix, nullifier],
      transaction.hash(),
      tx,
    )
  }

  async deleteNullifierToTransactionHash(
    account: Account,
    nullifier: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.nullifierToTransactionHash.del([account.prefix, nullifier], tx)
  }

  async putMultisigSecret(
    identity: Buffer,
    value: MultisigSecretValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.multisigSecrets.put(identity, value, tx)
  }

  async getMultisigSecret(
    identity: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<MultisigSecretValue | undefined> {
    return this.multisigSecrets.get(identity, tx)
  }

  async hasMultisigSecret(identity: Buffer, tx?: IDatabaseTransaction): Promise<boolean> {
    return (await this.getMultisigSecret(identity, tx)) !== undefined
  }

  async deleteMultisigSecret(identity: Buffer, tx?: IDatabaseTransaction): Promise<void> {
    await this.multisigSecrets.del(identity, tx)
  }

  async getMultisigSecretByName(
    name: string,
    tx?: IDatabaseTransaction,
  ): Promise<MultisigSecretValue | undefined> {
    for await (const value of this.multisigSecrets.getAllValuesIter(tx)) {
      if (value.name === name) {
        return value
      }
    }

    return undefined
  }

  async hasMultisigSecretName(name: string, tx?: IDatabaseTransaction): Promise<boolean> {
    return (await this.getMultisigSecretByName(name, tx)) !== undefined
  }

  async *getMultisigSecrets(tx?: IDatabaseTransaction): AsyncGenerator<MultisigSecretValue> {
    for await (const value of this.multisigSecrets.getAllValuesIter(tx)) {
      yield value
    }
  }

  async encryptAccount(
    account: Account,
    passphrase: string,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.db.withTransaction(tx, async (tx) => {
      const encrypted = account.encrypt(passphrase)
      await this.accounts.put(account.id, encrypted.serialize(), tx)
    })
  }
}
