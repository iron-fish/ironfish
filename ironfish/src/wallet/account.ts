/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferMap, BufferSet } from 'buffer-map'
import MurmurHash3 from 'imurmurhash'
import { Assert } from '../assert'
import { BlockHeader, Transaction } from '../primitives'
import { GENESIS_BLOCK_SEQUENCE } from '../primitives/block'
import { Note } from '../primitives/note'
import { DatabaseKeyRange, IDatabaseTransaction } from '../storage'
import { StorageUtils } from '../storage/database/utils'
import { DecryptedNote } from '../workerPool/tasks/decryptNotes'
import { AssetBalances } from './assetBalances'
import { AccountValue } from './walletdb/accountValue'
import { BalanceValue } from './walletdb/balanceValue'
import { DecryptedNoteValue } from './walletdb/decryptedNoteValue'
import { HeadValue } from './walletdb/headValue'
import { TransactionAmountsValue } from './walletdb/transactionAmountsValue'
import { TransactionValue } from './walletdb/transactionValue'
import { WalletDB } from './walletdb/walletdb'

export const ACCOUNT_KEY_LENGTH = 32

export type AccountImport = { name: string; spendingKey: string }

export class Account {
  private readonly walletDb: WalletDB

  readonly id: string
  readonly displayName: string
  name: string
  readonly spendingKey: string
  readonly incomingViewKey: string
  readonly outgoingViewKey: string
  publicAddress: string
  readonly prefix: Buffer
  readonly prefixRange: DatabaseKeyRange

  constructor({
    id,
    name,
    spendingKey,
    incomingViewKey,
    outgoingViewKey,
    publicAddress,
    walletDb,
  }: {
    id: string
    name: string
    spendingKey: string
    incomingViewKey: string
    outgoingViewKey: string
    publicAddress: string
    walletDb: WalletDB
  }) {
    this.id = id
    this.name = name
    this.spendingKey = spendingKey
    this.incomingViewKey = incomingViewKey
    this.outgoingViewKey = outgoingViewKey
    this.publicAddress = publicAddress

    this.prefix = calculateAccountPrefix(id)
    this.prefixRange = StorageUtils.getPrefixKeyRange(this.prefix)

    this.displayName = `${name} (${id.slice(0, 7)})`

    this.walletDb = walletDb
  }

  serialize(): AccountValue {
    return {
      id: this.id,
      name: this.name,
      spendingKey: this.spendingKey,
      incomingViewKey: this.incomingViewKey,
      outgoingViewKey: this.outgoingViewKey,
      publicAddress: this.publicAddress,
    }
  }

  async *getNotes(): AsyncGenerator<DecryptedNoteValue & { hash: Buffer }> {
    for await (const decryptedNote of this.walletDb.loadDecryptedNotes(this)) {
      yield decryptedNote
    }
  }

  async *getUnspentNotes(
    assetId: Buffer,
    options?: {
      confirmations?: number
    },
  ): AsyncGenerator<DecryptedNoteValue & { hash: Buffer }> {
    const head = await this.getHead()
    if (!head) {
      return
    }

    const confirmations = options?.confirmations ?? 0

    const maxConfirmedSequence = head.sequence - confirmations

    for await (const decryptedNote of this.getNotes()) {
      if (!decryptedNote.note.assetId().equals(assetId)) {
        continue
      }

      if (decryptedNote.spent) {
        continue
      }

      if (!decryptedNote.sequence) {
        continue
      }

      if (decryptedNote.sequence > maxConfirmedSequence) {
        continue
      }

      yield decryptedNote
    }
  }

  async getDecryptedNote(
    hash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<DecryptedNoteValue | undefined> {
    return await this.walletDb.loadDecryptedNote(this, hash, tx)
  }

  async connectTransaction(
    blockHeader: BlockHeader,
    transaction: Transaction,
    decryptedNotes: Array<DecryptedNote>,
    tx?: IDatabaseTransaction,
  ): Promise<AssetBalances> {
    const blockHash = blockHeader.hash
    const sequence = blockHeader.sequence
    const assetBalanceDeltas = new AssetBalances()
    const inputs = new AssetBalances()
    const outputs = new AssetBalances()
    let submittedSequence = sequence
    let timestamp = new Date()

    await this.walletDb.db.withTransaction(tx, async (tx) => {
      const transactionValue = await this.getTransaction(transaction.hash(), tx)
      if (transactionValue) {
        submittedSequence = transactionValue.submittedSequence
        timestamp = transactionValue.timestamp
      }

      for (const decryptedNote of decryptedNotes) {
        if (decryptedNote.forSpender) {
          continue
        }

        const pendingNote = await this.getDecryptedNote(decryptedNote.hash, tx)

        const note = {
          accountId: this.id,
          note: new Note(decryptedNote.serializedNote),
          spent: pendingNote?.spent ?? false,
          transactionHash: transaction.hash(),
          nullifier: decryptedNote.nullifier,
          index: decryptedNote.index,
          blockHash,
          sequence,
        }

        assetBalanceDeltas.increment(note.note.assetId(), note.note.value())
        outputs.increment(note.note.assetId(), note.note.value())

        await this.walletDb.saveDecryptedNote(this, decryptedNote.hash, note, tx)
      }

      for (const spend of transaction.spends) {
        const spentNoteHash = await this.getNoteHash(spend.nullifier, tx)
        if (!spentNoteHash) {
          continue
        }

        const note = await this.getDecryptedNote(spentNoteHash, tx)

        Assert.isNotUndefined(note)

        assetBalanceDeltas.increment(note.note.assetId(), -note.note.value())
        inputs.increment(note.note.assetId(), note.note.value())

        const spentNote = { ...note, spent: true }
        await this.walletDb.saveDecryptedNote(this, spentNoteHash, spentNote, tx)
      }

      await this.walletDb.saveTransaction(
        this,
        transaction.hash(),
        {
          transaction,
          blockHash,
          sequence,
          submittedSequence,
          timestamp,
          assetBalanceDeltas,
        },
        tx,
      )
      await this.saveTransactionAmounts(transaction.hash(), inputs, outputs, tx)
    })

    return assetBalanceDeltas
  }

  async addPendingTransaction(
    transaction: Transaction,
    decryptedNotes: Array<DecryptedNote>,
    submittedSequence: number,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const assetBalanceDeltas = new AssetBalances()
    const inputs = new AssetBalances()
    const outputs = new AssetBalances()

    await this.walletDb.db.withTransaction(tx, async (tx) => {
      if (await this.hasTransaction(transaction.hash(), tx)) {
        return
      }

      for (const decryptedNote of decryptedNotes) {
        if (decryptedNote.forSpender) {
          continue
        }

        const note = {
          accountId: this.id,
          note: new Note(decryptedNote.serializedNote),
          spent: false,
          transactionHash: transaction.hash(),
          nullifier: null,
          index: null,
          blockHash: null,
          sequence: null,
        }

        assetBalanceDeltas.increment(note.note.assetId(), note.note.value())
        outputs.increment(note.note.assetId(), note.note.value())

        await this.walletDb.saveDecryptedNote(this, decryptedNote.hash, note, tx)
      }

      for (const spend of transaction.spends) {
        const spentNoteHash = await this.getNoteHash(spend.nullifier, tx)
        if (!spentNoteHash) {
          continue
        }

        const note = await this.getDecryptedNote(spentNoteHash, tx)

        Assert.isNotUndefined(note)

        assetBalanceDeltas.increment(note.note.assetId(), -note.note.value())
        inputs.increment(note.note.assetId(), note.note.value())

        const spentNote = { ...note, spent: true }
        await this.walletDb.saveDecryptedNote(this, spentNoteHash, spentNote, tx)
      }

      await this.walletDb.saveTransaction(
        this,
        transaction.hash(),
        {
          transaction,
          blockHash: null,
          sequence: null,
          submittedSequence,
          timestamp: new Date(),
          assetBalanceDeltas,
        },
        tx,
      )
      await this.saveTransactionAmounts(transaction.hash(), inputs, outputs, tx)
    })
  }

  async disconnectTransaction(
    blockHeader: BlockHeader,
    transaction: Transaction,
    tx?: IDatabaseTransaction,
  ): Promise<AssetBalances> {
    const assetBalanceDeltas = new AssetBalances()
    await this.walletDb.db.withTransaction(tx, async (tx) => {
      const transactionValue = await this.getTransaction(transaction.hash(), tx)
      if (transactionValue === undefined) {
        return
      }

      for (const note of transaction.notes) {
        const noteHash = note.hash()

        const decryptedNoteValue = await this.getDecryptedNote(noteHash, tx)
        if (decryptedNoteValue === undefined) {
          continue
        }

        assetBalanceDeltas.increment(
          decryptedNoteValue.note.assetId(),
          -decryptedNoteValue.note.value(),
        )

        const sequence = decryptedNoteValue.sequence
        Assert.isNotNull(sequence)
        await this.walletDb.disconnectNoteHashSequence(this, noteHash, sequence, tx)

        Assert.isNotNull(decryptedNoteValue.nullifier)
        await this.walletDb.deleteNullifier(this, decryptedNoteValue.nullifier, tx)

        await this.walletDb.saveDecryptedNote(
          this,
          noteHash,
          {
            ...decryptedNoteValue,
            nullifier: null,
            index: null,
            blockHash: null,
            sequence: null,
          },
          tx,
        )
      }

      for (const spend of transaction.spends) {
        const spentNoteHash = await this.getNoteHash(spend.nullifier, tx)
        if (!spentNoteHash) {
          continue
        }

        const spentNote = await this.getDecryptedNote(spentNoteHash, tx)

        Assert.isNotUndefined(spentNote)

        assetBalanceDeltas.increment(spentNote.note.assetId(), spentNote.note.value())
      }

      await this.walletDb.deleteSequenceToTransactionHash(
        this,
        blockHeader.sequence,
        transaction.hash(),
        tx,
      )

      await this.walletDb.savePendingTransactionHash(
        this,
        transaction.expiration(),
        transaction.hash(),
        tx,
      )

      await this.walletDb.saveTransaction(
        this,
        transaction.hash(),
        { ...transactionValue, blockHash: null, sequence: null },
        tx,
      )
    })

    return assetBalanceDeltas
  }

  async saveTransactionAmounts(
    transactionHash: Buffer,
    inputAmounts: AssetBalances,
    outputAmounts: AssetBalances,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const assetIds = new BufferSet([...inputAmounts.keys(), ...outputAmounts.keys()])

    await this.walletDb.db.withTransaction(tx, async (tx) => {
      for (const assetId of assetIds) {
        const input = inputAmounts.get(assetId) ?? 0n
        const output = outputAmounts.get(assetId) ?? 0n

        await this.walletDb.putTransactionAmounts(
          this,
          transactionHash,
          assetId,
          { input, output },
          tx,
        )
      }
    })
  }

  async deleteTransaction(transaction: Transaction, tx?: IDatabaseTransaction): Promise<void> {
    await this.walletDb.db.withTransaction(tx, async (tx) => {
      if (!(await this.hasTransaction(transaction.hash(), tx))) {
        return
      }

      // expiring transaction deletes output notes and sets spent notes to unspent
      await this.expireTransaction(transaction, tx)
      await this.walletDb.deleteTransaction(this, transaction.hash(), tx)
    })
  }

  private async deleteDecryptedNote(
    noteHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.walletDb.db.withTransaction(tx, async (tx) => {
      const decryptedNote = await this.getDecryptedNote(noteHash, tx)

      if (!decryptedNote) {
        return
      }

      await this.walletDb.deleteDecryptedNote(this, noteHash, tx)
      await this.walletDb.deleteNoteHashSequence(this, noteHash, decryptedNote.sequence, tx)

      if (decryptedNote.nullifier) {
        await this.walletDb.deleteNullifier(this, decryptedNote.nullifier, tx)
      }
    })
  }

  async getNoteHash(nullifier: Buffer, tx?: IDatabaseTransaction): Promise<Buffer | null> {
    return await this.walletDb.loadNoteHash(this, nullifier, tx)
  }

  async getTransaction(
    hash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<Readonly<TransactionValue> | undefined> {
    return await this.walletDb.loadTransaction(this, hash, tx)
  }

  async hasTransaction(hash: Buffer, tx?: IDatabaseTransaction): Promise<boolean> {
    return this.walletDb.hasTransaction(this, hash, tx)
  }

  async hasPendingTransaction(hash: Buffer, tx?: IDatabaseTransaction): Promise<boolean> {
    return this.walletDb.hasPendingTransaction(this, hash, tx)
  }

  async hasSpend(transaction: Transaction, tx?: IDatabaseTransaction): Promise<boolean> {
    for (const spend of transaction.spends) {
      if ((await this.getNoteHash(spend.nullifier, tx)) !== null) {
        return true
      }
    }

    return false
  }

  getTransactions(tx?: IDatabaseTransaction): AsyncGenerator<Readonly<TransactionValue>> {
    return this.walletDb.loadTransactions(this, tx)
  }

  getTransactionsByTime(tx?: IDatabaseTransaction): AsyncGenerator<Readonly<TransactionValue>> {
    return this.walletDb.loadTransactionsByTime(this, tx)
  }

  getPendingTransactions(
    headSequence: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<TransactionValue> {
    return this.walletDb.loadPendingTransactions(this, headSequence, tx)
  }

  getExpiredTransactions(
    headSequence: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<TransactionValue> {
    return this.walletDb.loadExpiredTransactions(this, headSequence, tx)
  }

  getTransactionAmounts(
    transactionHash: Buffer,
    assetId: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<TransactionAmountsValue | undefined> {
    return this.walletDb.getTransactionAmounts(this, transactionHash, assetId, tx)
  }

  async expireTransaction(transaction: Transaction, tx?: IDatabaseTransaction): Promise<void> {
    const transactionHash = transaction.hash()

    await this.walletDb.db.withTransaction(tx, async (tx) => {
      for (const note of transaction.notes) {
        await this.deleteDecryptedNote(note.hash(), tx)
      }

      for (const spend of transaction.spends) {
        const noteHash = await this.getNoteHash(spend.nullifier, tx)

        if (noteHash) {
          const decryptedNote = await this.getDecryptedNote(noteHash, tx)
          Assert.isNotUndefined(
            decryptedNote,
            'nullifierToNote mappings must have a corresponding decryptedNote',
          )

          await this.walletDb.saveDecryptedNote(
            this,
            noteHash,
            {
              ...decryptedNote,
              spent: false,
            },
            tx,
          )
        }
      }

      await this.walletDb.deletePendingTransactionHash(
        this,
        transaction.expiration(),
        transactionHash,
        tx,
      )
    })
  }

  async *getBalances(
    confirmations: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<{
    assetId: Buffer
    unconfirmed: bigint
    unconfirmedCount: number
    confirmed: bigint
    pending: bigint
    pendingCount: number
    available: bigint
    blockHash: Buffer | null
    sequence: number | null
  }> {
    const head = await this.getHead()
    if (!head) {
      return
    }

    for await (const { assetId, balance } of this.walletDb.getUnconfirmedBalances(this, tx)) {
      const { confirmed, pending, available, unconfirmedCount, pendingCount } =
        await this.calculateBalances(
          head.sequence,
          assetId,
          confirmations,
          balance.unconfirmed,
          tx,
        )

      yield {
        assetId,
        unconfirmed: balance.unconfirmed,
        unconfirmedCount,
        confirmed,
        pending,
        pendingCount,
        available,
        blockHash: balance.blockHash,
        sequence: balance.sequence,
      }
    }
  }

  /**
   * Gets the balance for an account
   * unconfirmed: all notes on the chain
   * confirmed: confirmed balance minus transactions in unconfirmed range
   */
  async getBalance(
    assetId: Buffer,
    confirmations: number,
    tx?: IDatabaseTransaction,
  ): Promise<{
    unconfirmed: bigint
    unconfirmedCount: number
    confirmed: bigint
    pending: bigint
    pendingCount: number
    available: bigint
    blockHash: Buffer | null
    sequence: number | null
  }> {
    const head = await this.getHead()
    if (!head) {
      return {
        unconfirmed: 0n,
        confirmed: 0n,
        pending: 0n,
        available: 0n,
        unconfirmedCount: 0,
        pendingCount: 0,
        blockHash: null,
        sequence: null,
      }
    }

    const balance = await this.getUnconfirmedBalance(assetId, tx)

    const { confirmed, pending, available, unconfirmedCount, pendingCount } =
      await this.calculateBalances(
        head.sequence,
        assetId,
        confirmations,
        balance.unconfirmed,
        tx,
      )

    return {
      unconfirmed: balance.unconfirmed,
      unconfirmedCount,
      confirmed,
      pending,
      pendingCount,
      available,
      blockHash: balance.blockHash,
      sequence: balance.sequence,
    }
  }

  async calculateBalances(
    headSequence: number,
    assetId: Buffer,
    confirmations: number,
    unconfirmed: bigint,
    tx?: IDatabaseTransaction,
  ): Promise<{
    confirmed: bigint
    pending: bigint
    available: bigint
    unconfirmedCount: number
    pendingCount: number
  }> {
    let unconfirmedCount = 0
    let confirmed = unconfirmed
    let available = unconfirmed

    if (confirmations > 0) {
      const unconfirmedSequenceEnd = headSequence

      const unconfirmedSequenceStart = Math.max(
        unconfirmedSequenceEnd - confirmations + 1,
        GENESIS_BLOCK_SEQUENCE,
      )

      for await (const transactionHash of this.walletDb.loadTransactionHashesInSequenceRange(
        this,
        unconfirmedSequenceStart,
        unconfirmedSequenceEnd,
        tx,
      )) {
        const amounts = await this.walletDb.getTransactionAmounts(
          this,
          transactionHash,
          assetId,
          tx,
        )

        if (amounts === undefined) {
          continue
        }

        unconfirmedCount++
        confirmed -= amounts.output - amounts.input
        available -= amounts.output
      }
    }

    let pendingCount = 0
    let pending = unconfirmed

    for await (const transactionHash of this.walletDb.loadPendingTransactionHashes(
      this,
      headSequence,
      tx,
    )) {
      const amounts = await this.walletDb.getTransactionAmounts(
        this,
        transactionHash,
        assetId,
        tx,
      )

      if (amounts === undefined) {
        continue
      }

      pendingCount++
      pending += amounts.output - amounts.input
      available -= amounts.input
    }

    return {
      confirmed,
      pending,
      available,
      unconfirmedCount,
      pendingCount,
    }
  }

  async getUnconfirmedBalances(tx?: IDatabaseTransaction): Promise<BufferMap<BalanceValue>> {
    const unconfirmedBalances = new BufferMap<BalanceValue>()
    for await (const { assetId, balance } of this.walletDb.getUnconfirmedBalances(this, tx)) {
      unconfirmedBalances.set(assetId, balance)
    }
    return unconfirmedBalances
  }

  async getUnconfirmedBalance(
    assetId: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<BalanceValue> {
    return this.walletDb.getUnconfirmedBalance(this, assetId, tx)
  }

  async updateUnconfirmedBalances(
    balanceDeltas: BufferMap<bigint>,
    blockHash: Buffer | null,
    sequence: number | null,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const unconfirmedBalances = await this.getUnconfirmedBalances(tx)

    for await (const [assetId, balance] of unconfirmedBalances.entries()) {
      const balanceDelta = balanceDeltas.get(assetId) ?? 0n

      await this.walletDb.saveUnconfirmedBalance(
        this,
        assetId,
        {
          unconfirmed: balance.unconfirmed + balanceDelta,
          blockHash,
          sequence,
        },
        tx,
      )
    }

    for (const [assetId, balanceDelta] of balanceDeltas.entries()) {
      if (unconfirmedBalances.has(assetId)) {
        continue
      }

      await this.walletDb.saveUnconfirmedBalance(
        this,
        assetId,
        {
          unconfirmed: balanceDelta,
          blockHash,
          sequence,
        },
        tx,
      )
    }
  }

  async saveUnconfirmedBalance(
    assetId: Buffer,
    balance: BalanceValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.walletDb.saveUnconfirmedBalance(this, assetId, balance, tx)
  }

  async getHead(tx?: IDatabaseTransaction): Promise<HeadValue | null> {
    return this.walletDb.getHead(this, tx)
  }

  async updateHead(head: HeadValue | null, tx?: IDatabaseTransaction): Promise<void> {
    await this.walletDb.saveHead(this, head, tx)
  }

  async getTransactionNotes(
    transaction: Transaction,
  ): Promise<Array<DecryptedNoteValue & { hash: Buffer }>> {
    const notes = []

    for (const note of transaction.notes) {
      const noteHash = note.hash()
      const decryptedNote = await this.getDecryptedNote(noteHash)

      if (decryptedNote) {
        notes.push({
          ...decryptedNote,
          hash: noteHash,
        })
      }
    }

    return notes
  }
}

export function calculateAccountPrefix(id: string): Buffer {
  const seed = 1
  const hash = new MurmurHash3(id, seed).result()

  const prefix = Buffer.alloc(4)
  prefix.writeUInt32BE(hash)
  return prefix
}
