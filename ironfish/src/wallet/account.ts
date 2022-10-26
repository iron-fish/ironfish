/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import MurmurHash3 from 'imurmurhash'
import { Assert } from '../assert'
import { GENESIS_BLOCK_SEQUENCE } from '../consensus/consensus'
import { Transaction } from '../primitives'
import { Note } from '../primitives/note'
import { DatabaseKeyRange, IDatabaseTransaction } from '../storage'
import { StorageUtils } from '../storage/database/utils'
import { BufferUtils } from '../utils'
import { DecryptedNote } from '../workerPool/tasks/decryptNotes'
import { SyncTransactionParams } from './wallet'
import { AccountValue } from './walletdb/accountValue'
import { DecryptedNoteValue } from './walletdb/decryptedNoteValue'
import { TransactionValue } from './walletdb/transactionValue'
import { WalletDB } from './walletdb/walletdb'

export const ACCOUNT_KEY_LENGTH = 32

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

  async reset(tx?: IDatabaseTransaction): Promise<void> {
    await this.walletDb.clearDecryptedNotes(this, tx)
    await this.walletDb.clearNullifierToNoteHash(this, tx)
    await this.walletDb.clearTransactions(this, tx)
    await this.walletDb.clearSequenceToNoteHash(this, tx)
    await this.walletDb.clearNonChainNoteHashes(this, tx)
    await this.walletDb.clearPendingTransactionHashes(this, tx)

    await this.saveUnconfirmedBalance(BigInt(0), tx)
  }

  async *getNotes(): AsyncGenerator<DecryptedNoteValue & { hash: Buffer }> {
    for await (const decryptedNote of this.walletDb.loadDecryptedNotes(this)) {
      yield decryptedNote
    }
  }

  async *getUnspentNotes(): AsyncGenerator<DecryptedNoteValue & { hash: Buffer }> {
    for await (const decryptedNote of this.getNotes()) {
      if (decryptedNote.spent) {
        continue
      }

      if (!decryptedNote.index) {
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

  async updateDecryptedNote(
    noteHash: Buffer,
    note: Readonly<DecryptedNoteValue>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.walletDb.db.withTransaction(tx, async (tx) => {
      const existingNote = await this.getDecryptedNote(noteHash)

      if (!existingNote || existingNote.spent !== note.spent) {
        const value = note.note.value()
        const currentUnconfirmedBalance = await this.walletDb.getUnconfirmedBalance(this, tx)

        if (note.spent) {
          await this.saveUnconfirmedBalance(currentUnconfirmedBalance - value, tx)
        } else {
          await this.saveUnconfirmedBalance(currentUnconfirmedBalance + value, tx)
        }
      }

      await this.walletDb.saveDecryptedNote(this, noteHash, note, tx)

      const transaction = await this.getTransaction(note.transactionHash, tx)

      await this.walletDb.setNoteHashSequence(this, noteHash, transaction?.sequence ?? null, tx)
    })
  }

  async syncTransaction(
    transaction: Transaction,
    decryptedNotes: Array<DecryptedNote>,
    params: SyncTransactionParams,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const transactionHash = transaction.hash()
    const blockHash = 'blockHash' in params ? params.blockHash : null
    const sequence = 'sequence' in params ? params.sequence : null
    let submittedSequence = 'submittedSequence' in params ? params.submittedSequence : null

    await this.walletDb.db.withTransaction(tx, async (tx) => {
      const record = await this.getTransaction(transactionHash, tx)
      if (record) {
        submittedSequence = record.submittedSequence
      }

      const shouldUpdateTransaction =
        !record ||
        !record.transaction.equals(transaction) ||
        !BufferUtils.equalsNullable(record.blockHash, blockHash)

      if (shouldUpdateTransaction) {
        await this.updateTransaction(
          transactionHash,
          { transaction, blockHash, sequence, submittedSequence },
          tx,
        )
      }

      const isRemovingTransaction = submittedSequence === null && blockHash === null
      await this.bulkUpdateDecryptedNotes(transactionHash, decryptedNotes, tx)
      await this.processTransactionSpends(transaction, isRemovingTransaction, tx)
    })
  }

  async updateTransaction(
    hash: Buffer,
    transactionValue: TransactionValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.walletDb.db.withTransaction(tx, async (tx) => {
      const expirationSequence = transactionValue.transaction.expirationSequence()

      if (transactionValue.blockHash) {
        await this.walletDb.deletePendingTransactionHash(this, expirationSequence, hash, tx)
      } else {
        await this.walletDb.savePendingTransactionHash(this, expirationSequence, hash, tx)
      }

      await this.walletDb.saveTransaction(this, hash, transactionValue, tx)
    })
  }

  private async bulkUpdateDecryptedNotes(
    transactionHash: Buffer,
    decryptedNotes: Array<DecryptedNote>,
    tx?: IDatabaseTransaction,
  ) {
    await this.walletDb.db.withTransaction(tx, async (tx) => {
      for (const decryptedNote of decryptedNotes) {
        if (decryptedNote.forSpender) {
          continue
        }

        if (decryptedNote.nullifier !== null) {
          await this.updateNullifierNoteHash(decryptedNote.nullifier, decryptedNote.hash, tx)
        }

        await this.updateDecryptedNote(
          decryptedNote.hash,
          {
            accountId: this.id,
            nullifier: decryptedNote.nullifier,
            index: decryptedNote.index,
            note: new Note(decryptedNote.serializedNote),
            spent: false,
            transactionHash,
          },
          tx,
        )
      }
    })
  }

  private async processTransactionSpends(
    transaction: Transaction,
    isRemovingTransaction: boolean,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    for (const spend of transaction.spends()) {
      const noteHash = await this.getNoteHash(spend.nullifier)

      if (noteHash) {
        const decryptedNote = await this.getDecryptedNote(noteHash)
        Assert.isNotUndefined(
          decryptedNote,
          'nullifierToNote mappings must have a corresponding decryptedNote',
        )

        await this.updateDecryptedNote(
          noteHash,
          {
            ...decryptedNote,
            spent: !isRemovingTransaction,
          },
          tx,
        )
      }
    }
  }

  private async deleteDecryptedNote(
    noteHash: Buffer,
    transactionHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.walletDb.db.withTransaction(tx, async (tx) => {
      const existingNote = await this.getDecryptedNote(noteHash)

      if (existingNote) {
        const note = existingNote.note
        const value = note.value()
        const currentUnconfirmedBalance = await this.walletDb.getUnconfirmedBalance(this, tx)

        if (existingNote.spent) {
          await this.saveUnconfirmedBalance(currentUnconfirmedBalance + value, tx)
        } else {
          await this.saveUnconfirmedBalance(currentUnconfirmedBalance - value, tx)
        }

        await this.walletDb.deleteDecryptedNote(this, noteHash, tx)
      }

      const record = await this.getTransaction(transactionHash, tx)
      await this.walletDb.deleteNoteHashSequence(this, noteHash, record?.sequence ?? null, tx)
    })
  }

  async getNoteHash(nullifier: Buffer): Promise<Buffer | null> {
    return await this.walletDb.loadNoteHash(this, nullifier)
  }

  private async updateNullifierNoteHash(
    nullifier: Buffer,
    noteHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.walletDb.saveNullifierNoteHash(this, nullifier, noteHash, tx)
  }

  private async deleteNullifier(nullifier: Buffer, tx?: IDatabaseTransaction): Promise<void> {
    await this.walletDb.deleteNullifier(this, nullifier, tx)
  }

  async getTransaction(
    hash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<Readonly<TransactionValue> | undefined> {
    return await this.walletDb.loadTransaction(this, hash, tx)
  }

  async getTransactionByUnsignedHash(
    unsignedHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<Readonly<TransactionValue> | undefined> {
    for await (const transactionValue of this.getTransactions(tx)) {
      if (unsignedHash.equals(transactionValue.transaction.unsignedHash())) {
        return transactionValue
      }
    }
  }

  getTransactions(tx?: IDatabaseTransaction): AsyncGenerator<Readonly<TransactionValue>> {
    return this.walletDb.loadTransactions(this, tx)
  }

  getExpiredTransactions(
    headSequence: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<TransactionValue> {
    return this.walletDb.loadExpiredTransactions(this, headSequence, tx)
  }

  async expireTransaction(transaction: Transaction, tx?: IDatabaseTransaction): Promise<void> {
    const transactionHash = transaction.hash()

    await this.walletDb.db.withTransaction(tx, async (tx) => {
      for (const note of transaction.notes()) {
        const noteHash = note.merkleHash()
        const decryptedNote = await this.getDecryptedNote(noteHash)

        if (decryptedNote) {
          await this.deleteDecryptedNote(noteHash, transactionHash, tx)

          if (decryptedNote.nullifier) {
            await this.deleteNullifier(decryptedNote.nullifier, tx)
          }
        }
      }

      for (const spend of transaction.spends()) {
        const noteHash = await this.getNoteHash(spend.nullifier)

        if (noteHash) {
          const decryptedNote = await this.getDecryptedNote(noteHash)
          Assert.isNotUndefined(
            decryptedNote,
            'nullifierToNote mappings must have a corresponding decryptedNote',
          )

          await this.updateDecryptedNote(
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
        transaction.expirationSequence(),
        transactionHash,
        tx,
      )
    })
  }

  /**
   * Gets the balance for an account
   * confirmed: all notes on the chain
   * unconfirmed: confirmed balance minus notes in unconfirmed range
   * pending: all notes on the chain, and notes not on the chain yet
   */
  async getBalance(
    headSequence: number,
    minimumBlockConfirmations: number,
    tx?: IDatabaseTransaction,
  ): Promise<{
    unconfirmed: bigint
    unconfirmedCount: number
    confirmed: bigint
    pending: bigint
    pendingCount: number
  }> {
    let pendingCount = 0
    let unconfirmedCount = 0

    const pending = await this.getUnconfirmedBalance(tx)

    let unconfirmed = pending
    for await (const note of this.walletDb.loadNotesNotOnChain(this, tx)) {
      if (!note.spent) {
        pendingCount++
        unconfirmed -= note.note.value()
      }
    }

    let confirmed = unconfirmed
    if (minimumBlockConfirmations > 0) {
      const unconfirmedSequenceEnd = headSequence

      const unconfirmedSequenceStart = Math.max(
        unconfirmedSequenceEnd - minimumBlockConfirmations + 1,
        GENESIS_BLOCK_SEQUENCE,
      )

      for await (const note of this.walletDb.loadNotesInSequenceRange(
        this,
        unconfirmedSequenceStart,
        unconfirmedSequenceEnd,
        tx,
      )) {
        if (!note.spent) {
          unconfirmedCount++
          confirmed -= note.note.value()
        }
      }
    }

    return {
      unconfirmed,
      unconfirmedCount,
      confirmed,
      pending,
      pendingCount,
    }
  }

  async getUnconfirmedBalance(tx?: IDatabaseTransaction): Promise<bigint> {
    return this.walletDb.getUnconfirmedBalance(this, tx)
  }

  private async saveUnconfirmedBalance(
    balance: bigint,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.walletDb.saveUnconfirmedBalance(this, balance, tx)
  }

  async getHeadHash(tx?: IDatabaseTransaction): Promise<Buffer | null> {
    return this.walletDb.getHeadHash(this, tx)
  }

  async getTransactionNotes(
    transaction: Transaction,
  ): Promise<Array<DecryptedNoteValue & { hash: Buffer }>> {
    const notes = []

    for (const note of transaction.notes()) {
      const noteHash = note.merkleHash()
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
