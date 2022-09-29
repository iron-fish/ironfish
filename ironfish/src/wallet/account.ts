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
import { AccountsDB } from './database/accountsdb'
import { AccountValue } from './database/accountValue'
import { DecryptedNoteValue } from './database/decryptedNoteValue'
import { TransactionValue } from './database/transactionValue'
import { SyncTransactionParams } from './wallet'

export const ACCOUNT_KEY_LENGTH = 32

export class Account {
  private readonly accountsDb: AccountsDB

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
    accountsDb,
  }: {
    id: string
    name: string
    spendingKey: string
    incomingViewKey: string
    outgoingViewKey: string
    publicAddress: string
    accountsDb: AccountsDB
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

    this.accountsDb = accountsDb
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
    await this.accountsDb.clearDecryptedNotes(this, tx)
    await this.accountsDb.clearNullifierToNoteHash(this, tx)
    await this.accountsDb.clearTransactions(this, tx)
    await this.accountsDb.clearSequenceToNoteHash(this, tx)
    await this.accountsDb.clearNonChainNoteHashes(this, tx)

    await this.saveUnconfirmedBalance(BigInt(0), tx)
  }

  async *getNotes(): AsyncGenerator<DecryptedNoteValue & { hash: Buffer }> {
    for await (const decryptedNote of this.accountsDb.loadDecryptedNotes(this)) {
      yield decryptedNote
    }
  }

  async *getUnspentNotes(): AsyncGenerator<{
    hash: Buffer
    index: number | null
    note: Note
    transactionHash: Buffer
  }> {
    for await (const decryptedNote of this.getNotes()) {
      if (!decryptedNote.spent) {
        yield decryptedNote
      }
    }
  }

  async getDecryptedNote(
    hash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<DecryptedNoteValue | undefined> {
    return await this.accountsDb.loadDecryptedNote(this, hash, tx)
  }

  async updateDecryptedNote(
    noteHash: Buffer,
    note: Readonly<DecryptedNoteValue>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.accountsDb.database.withTransaction(tx, async (tx) => {
      const existingNote = await this.getDecryptedNote(noteHash)

      if (!existingNote || existingNote.spent !== note.spent) {
        const value = note.note.value()
        const currentUnconfirmedBalance = await this.accountsDb.getUnconfirmedBalance(this, tx)

        if (note.spent) {
          await this.saveUnconfirmedBalance(currentUnconfirmedBalance - value, tx)
        } else {
          await this.saveUnconfirmedBalance(currentUnconfirmedBalance + value, tx)
        }
      }

      await this.accountsDb.saveDecryptedNote(this, noteHash, note, tx)

      const transaction = await this.getTransaction(note.transactionHash, tx)

      await this.accountsDb.setNoteHashSequence(
        this,
        noteHash,
        transaction?.sequence ?? null,
        tx,
      )
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

    await this.accountsDb.database.withTransaction(tx, async (tx) => {
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
    await this.accountsDb.saveTransaction(this, hash, transactionValue, tx)
  }

  private async bulkUpdateDecryptedNotes(
    transactionHash: Buffer,
    decryptedNotes: Array<DecryptedNote>,
    tx?: IDatabaseTransaction,
  ) {
    await this.accountsDb.database.withTransaction(tx, async (tx) => {
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
    await this.accountsDb.database.withTransaction(tx, async (tx) => {
      const existingNote = await this.getDecryptedNote(noteHash)

      if (existingNote) {
        const note = existingNote.note
        const value = note.value()
        const currentUnconfirmedBalance = await this.accountsDb.getUnconfirmedBalance(this, tx)

        if (existingNote.spent) {
          await this.saveUnconfirmedBalance(currentUnconfirmedBalance + value, tx)
        } else {
          await this.saveUnconfirmedBalance(currentUnconfirmedBalance - value, tx)
        }

        await this.accountsDb.deleteDecryptedNote(this, noteHash, tx)
      }

      const record = await this.getTransaction(transactionHash, tx)
      await this.accountsDb.deleteNoteHashSequence(this, noteHash, record?.sequence ?? null, tx)
    })
  }

  async getNoteHash(nullifier: Buffer): Promise<Buffer | null> {
    return await this.accountsDb.loadNoteHash(this, nullifier)
  }

  private async updateNullifierNoteHash(
    nullifier: Buffer,
    noteHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.accountsDb.saveNullifierNoteHash(this, nullifier, noteHash, tx)
  }

  private async deleteNullifier(nullifier: Buffer, tx?: IDatabaseTransaction): Promise<void> {
    await this.accountsDb.deleteNullifier(this, nullifier, tx)
  }

  async getTransaction(
    hash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<Readonly<TransactionValue> | undefined> {
    return await this.accountsDb.loadTransaction(this, hash, tx)
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
    return this.accountsDb.loadTransactions(this, tx)
  }

  async deleteTransaction(transaction: Transaction, tx?: IDatabaseTransaction): Promise<void> {
    const transactionHash = transaction.hash()

    await this.accountsDb.database.withTransaction(tx, async (tx) => {
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

      await this.accountsDb.deleteTransaction(this, transactionHash, tx)
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
    for await (const note of this.accountsDb.loadNotesNotOnChain(this, tx)) {
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

      for await (const note of this.accountsDb.loadNotesInSequenceRange(
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
    return this.accountsDb.getUnconfirmedBalance(this, tx)
  }

  private async saveUnconfirmedBalance(
    balance: bigint,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.accountsDb.saveUnconfirmedBalance(this, balance, tx)
  }

  async getHeadHash(tx?: IDatabaseTransaction): Promise<Buffer | null> {
    return this.accountsDb.getHeadHash(this, tx)
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
