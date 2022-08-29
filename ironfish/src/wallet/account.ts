/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferMap, BufferSet } from 'buffer-map'
import MurmurHash3 from 'imurmurhash'
import { Assert } from '../assert'
import { Transaction } from '../primitives'
import { Note } from '../primitives/note'
import { IDatabaseTransaction } from '../storage'
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
  private readonly decryptedNotes: BufferMap<DecryptedNoteValue>
  private readonly nullifierToNoteHash: BufferMap<Buffer>
  private readonly transactions: BufferMap<Readonly<TransactionValue>>

  private readonly sequenceToNoteHashes: Map<number, BufferSet>
  private readonly nonChainNoteHashes: BufferSet

  readonly id: string
  readonly displayName: string
  name: string
  readonly spendingKey: string
  readonly incomingViewKey: string
  readonly outgoingViewKey: string
  publicAddress: string

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

    const prefixHash = new MurmurHash3(this.spendingKey, 1)
      .hash(this.incomingViewKey)
      .hash(this.outgoingViewKey)
      .result()
      .toString(16)
    const hashSlice = prefixHash.slice(0, 7)
    this.displayName = `${this.name} (${hashSlice})`

    this.accountsDb = accountsDb
    this.decryptedNotes = new BufferMap<DecryptedNoteValue>()
    this.nullifierToNoteHash = new BufferMap<Buffer>()
    this.transactions = new BufferMap<TransactionValue>()

    this.sequenceToNoteHashes = new Map<number, BufferSet>()
    this.nonChainNoteHashes = new BufferSet()
  }

  serialize(): AccountValue {
    return {
      name: this.name,
      spendingKey: this.spendingKey,
      incomingViewKey: this.incomingViewKey,
      outgoingViewKey: this.outgoingViewKey,
      publicAddress: this.publicAddress,
    }
  }

  async load(): Promise<void> {
    let unconfirmedBalance = BigInt(0)

    for await (const { hash, decryptedNote } of this.accountsDb.loadDecryptedNotes()) {
      if (decryptedNote.accountId !== this.id) {
        continue
      }

      this.decryptedNotes.set(hash, decryptedNote)

      if (!decryptedNote.spent) {
        unconfirmedBalance += new Note(decryptedNote.serializedNote).value()
      }

      const nullifierHash = decryptedNote.nullifierHash
      if (nullifierHash) {
        this.nullifierToNoteHash.set(nullifierHash, hash)
      }

      const transactionHash = decryptedNote.transactionHash
      const transactionValue = await this.accountsDb.loadTransaction(transactionHash)
      Assert.isNotNull(
        transactionValue,
        `Transaction not found for '${transactionHash.toString('hex')}'`,
      )

      this.transactions.set(transactionHash, transactionValue)

      this.saveDecryptedNoteSequence(transactionHash, hash)
    }

    for await (const { hash, transactionValue } of this.accountsDb.loadTransactions()) {
      if (this.transactions.has(hash)) {
        continue
      }

      for (const spend of transactionValue.transaction.spends()) {
        if (this.nullifierToNoteHash.has(spend.nullifier)) {
          this.transactions.set(hash, transactionValue)
          break
        }
      }
    }

    await this.saveUnconfirmedBalance(unconfirmedBalance)
  }

  async save(tx?: IDatabaseTransaction): Promise<void> {
    await this.accountsDb.database.withTransaction(tx, async (tx) => {
      await this.accountsDb.replaceDecryptedNotes(this.decryptedNotes, tx)
      await this.accountsDb.replaceNullifierToNoteHash(this.nullifierToNoteHash, tx)
      await this.accountsDb.replaceTransactions(this.transactions, tx)
    })
  }

  async reset(tx?: IDatabaseTransaction): Promise<void> {
    this.decryptedNotes.clear()
    this.nullifierToNoteHash.clear()
    this.transactions.clear()
    await this.saveUnconfirmedBalance(BigInt(0), tx)
  }

  getNotes(): ReadonlyArray<{
    hash: Buffer
    index: number | null
    note: Note
    transactionHash: Buffer
    spent: boolean
  }> {
    const notes = []

    for (const [hash, decryptedNote] of this.decryptedNotes) {
      notes.push({
        hash,
        index: decryptedNote.index,
        note: new Note(decryptedNote.serializedNote),
        transactionHash: decryptedNote.transactionHash,
        spent: decryptedNote.spent,
      })
    }

    return notes
  }

  getUnspentNotes(): ReadonlyArray<{
    hash: Buffer
    index: number | null
    note: Note
    transactionHash: Buffer
  }> {
    return this.getNotes().filter((note) => !note.spent)
  }

  getDecryptedNote(hash: Buffer): DecryptedNoteValue | undefined {
    return this.decryptedNotes.get(hash)
  }

  async updateDecryptedNote(
    noteHash: Buffer,
    note: Readonly<DecryptedNoteValue>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.accountsDb.database.withTransaction(tx, async (tx) => {
      const existingNote = this.decryptedNotes.get(noteHash)
      if (!existingNote || existingNote.spent !== note.spent) {
        const value = new Note(note.serializedNote).value()
        const currentUnconfirmedBalance = await this.accountsDb.getUnconfirmedBalance(this, tx)

        if (note.spent) {
          await this.saveUnconfirmedBalance(currentUnconfirmedBalance - value, tx)
        } else {
          await this.saveUnconfirmedBalance(currentUnconfirmedBalance + value, tx)
        }
      }

      this.saveDecryptedNoteSequence(note.transactionHash, noteHash)
      this.decryptedNotes.set(noteHash, note)
      await this.accountsDb.saveDecryptedNote(noteHash, note, tx)
    })
  }

  private saveDecryptedNoteSequence(transactionHash: Buffer, noteHash: Buffer): void {
    const transaction = this.transactions.get(transactionHash)
    Assert.isNotUndefined(
      transaction,
      `Transaction undefined for '${transactionHash.toString('hex')}'`,
    )

    const { sequence, blockHash } = transaction
    if (blockHash) {
      Assert.isNotNull(sequence, `sequence required when submitting block hash`)
      const decryptedNotes = this.sequenceToNoteHashes.get(sequence) ?? new BufferSet()
      decryptedNotes.add(noteHash)
      this.sequenceToNoteHashes.set(sequence, decryptedNotes)
      this.nonChainNoteHashes.delete(noteHash)
    } else {
      this.nonChainNoteHashes.add(noteHash)
    }
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
      const record = this.transactions.get(transactionHash)
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
    this.transactions.set(hash, transactionValue)
    await this.accountsDb.saveTransaction(hash, transactionValue, tx)
  }

  private async bulkUpdateDecryptedNotes(
    transactionHash: Buffer,
    decryptedNotes: Array<DecryptedNote>,
    tx?: IDatabaseTransaction,
  ) {
    await this.accountsDb.database.withTransaction(tx, async (tx) => {
      for (const decryptedNote of decryptedNotes) {
        if (!decryptedNote.forSpender) {
          if (decryptedNote.nullifier !== null) {
            await this.updateNullifierNoteHash(decryptedNote.nullifier, decryptedNote.hash, tx)
          }

          await this.updateDecryptedNote(
            decryptedNote.hash,
            {
              accountId: this.id,
              nullifierHash: decryptedNote.nullifier,
              index: decryptedNote.index,
              serializedNote: decryptedNote.serializedNote,
              spent: false,
              transactionHash,
            },
            tx,
          )
        }
      }
    })
  }

  private async processTransactionSpends(
    transaction: Transaction,
    isRemovingTransaction: boolean,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    for (const spend of transaction.spends()) {
      const noteHash = this.getNoteHash(spend.nullifier)

      if (noteHash) {
        const decryptedNote = this.getDecryptedNote(noteHash)
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
      const existingNote = this.decryptedNotes.get(noteHash)
      if (existingNote) {
        const note = new Note(existingNote.serializedNote)
        const value = note.value()
        const currentUnconfirmedBalance = await this.accountsDb.getUnconfirmedBalance(this, tx)

        if (existingNote.spent) {
          await this.saveUnconfirmedBalance(currentUnconfirmedBalance + value, tx)
        } else {
          await this.saveUnconfirmedBalance(currentUnconfirmedBalance - value, tx)
        }
      }

      const record = this.transactions.get(transactionHash)
      if (record && record.sequence) {
        const { sequence } = record
        const noteHashes = this.sequenceToNoteHashes.get(sequence)
        if (noteHashes) {
          noteHashes.delete(noteHash)
          this.sequenceToNoteHashes.set(sequence, noteHashes)
        }
      }

      this.nonChainNoteHashes.delete(noteHash)
      this.decryptedNotes.delete(noteHash)
      await this.accountsDb.deleteDecryptedNote(noteHash, tx)
    })
  }

  getNoteHash(nullifier: Buffer): Buffer | undefined {
    return this.nullifierToNoteHash.get(nullifier)
  }

  async updateNullifierNoteHash(
    nullifier: Buffer,
    noteHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    this.nullifierToNoteHash.set(nullifier, noteHash)
    await this.accountsDb.saveNullifierNoteHash(nullifier, noteHash, tx)
  }

  async deleteNullifier(nullifier: Buffer, tx?: IDatabaseTransaction): Promise<void> {
    this.nullifierToNoteHash.delete(nullifier)
    await this.accountsDb.deleteNullifier(nullifier, tx)
  }

  getTransaction(hash: Buffer): Readonly<TransactionValue> | undefined {
    return this.transactions.get(hash)
  }

  getTransactions(): Generator<Readonly<TransactionValue>> {
    return this.transactions.values()
  }

  async deleteTransaction(transaction: Transaction, tx?: IDatabaseTransaction): Promise<void> {
    const transactionHash = transaction.hash()

    await this.accountsDb.database.withTransaction(tx, async (tx) => {
      for (const note of transaction.notes()) {
        const noteHash = note.merkleHash()
        const decryptedNote = this.getDecryptedNote(noteHash)

        if (decryptedNote) {
          await this.deleteDecryptedNote(noteHash, transactionHash, tx)

          if (decryptedNote.nullifierHash) {
            const nullifier = decryptedNote.nullifierHash
            await this.deleteNullifier(nullifier, tx)
          }
        }
      }

      for (const spend of transaction.spends()) {
        const noteHash = this.getNoteHash(spend.nullifier)

        if (noteHash) {
          const decryptedNote = this.getDecryptedNote(noteHash)
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

      this.transactions.delete(transactionHash)
      await this.accountsDb.deleteTransaction(transactionHash, tx)
    })
  }

  async getBalance(
    unconfirmedSequenceStart: number,
    headSequence: number,
    tx?: IDatabaseTransaction,
  ): Promise<{ unconfirmed: BigInt; confirmed: BigInt }> {
    const unconfirmed = await this.getUnconfirmedBalance(tx)
    let confirmed = unconfirmed

    for (let i = unconfirmedSequenceStart; i < headSequence; i++) {
      const noteHashes = this.sequenceToNoteHashes.get(i)
      if (noteHashes) {
        for (const hash of noteHashes) {
          const note = this.decryptedNotes.get(hash)
          Assert.isNotUndefined(note)
          if (!note.spent) {
            confirmed -= new Note(note.serializedNote).value()
          }
        }
      }
    }

    for (const noteHash of this.nonChainNoteHashes) {
      const note = this.decryptedNotes.get(noteHash)
      Assert.isNotUndefined(note)
      if (!note.spent) {
        confirmed -= new Note(note.serializedNote).value()
      }
    }

    return {
      unconfirmed,
      confirmed,
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
}
