/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferSet } from 'buffer-map'
import MurmurHash3 from 'imurmurhash'
import { Assert } from '../assert'
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

  private readonly sequenceToNoteHashes: Map<number, BufferSet>
  private readonly nonChainNoteHashes: BufferSet

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

    this.sequenceToNoteHashes = new Map<number, BufferSet>()
    this.nonChainNoteHashes = new BufferSet()
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

  async load(): Promise<void> {
    for await (const { hash, decryptedNote } of this.accountsDb.loadDecryptedNotes(this)) {
      const transaction = await this.getTransaction(decryptedNote.transactionHash)

      this.saveDecryptedNoteSequence(hash, transaction?.sequence ?? null)
    }
  }

  unload(): void {
    this.sequenceToNoteHashes.clear()
    this.nonChainNoteHashes.clear()
  }

  async reset(tx?: IDatabaseTransaction): Promise<void> {
    await this.accountsDb.clearDecryptedNotes(this, tx)
    await this.accountsDb.clearNullifierToNoteHash(this, tx)
    await this.accountsDb.clearTransactions(this, tx)

    await this.saveUnconfirmedBalance(BigInt(0), tx)
  }

  async *getNotes(): AsyncGenerator<{
    hash: Buffer
    index: number | null
    note: Note
    transactionHash: Buffer
    spent: boolean
  }> {
    for await (const { hash, decryptedNote } of this.accountsDb.loadDecryptedNotes(this)) {
      yield {
        hash,
        index: decryptedNote.index,
        note: decryptedNote.note,
        transactionHash: decryptedNote.transactionHash,
        spent: decryptedNote.spent,
      }
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

  async getDecryptedNote(hash: Buffer): Promise<DecryptedNoteValue | undefined> {
    return await this.accountsDb.loadDecryptedNote(this, hash)
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
      this.saveDecryptedNoteSequence(noteHash, transaction?.sequence ?? null)
    })
  }

  private saveDecryptedNoteSequence(noteHash: Buffer, sequence: number | null): void {
    if (sequence) {
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
      }

      const record = await this.getTransaction(transactionHash, tx)
      if (record && record.sequence) {
        const { sequence } = record
        const noteHashes = this.sequenceToNoteHashes.get(sequence)
        if (noteHashes) {
          noteHashes.delete(noteHash)
          this.sequenceToNoteHashes.set(sequence, noteHashes)
        }
      }

      this.nonChainNoteHashes.delete(noteHash)
      await this.accountsDb.deleteDecryptedNote(this, noteHash, tx)
    })
  }

  async getNoteHash(nullifier: Buffer): Promise<Buffer | null> {
    return await this.accountsDb.loadNoteHash(this, nullifier)
  }

  async updateNullifierNoteHash(
    nullifier: Buffer,
    noteHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.accountsDb.saveNullifierNoteHash(this, nullifier, noteHash, tx)
  }

  async deleteNullifier(nullifier: Buffer, tx?: IDatabaseTransaction): Promise<void> {
    await this.accountsDb.deleteNullifier(this, nullifier, tx)
  }

  async getTransaction(
    hash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<Readonly<TransactionValue> | undefined> {
    return await this.accountsDb.loadTransaction(this, hash, tx)
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
          const note = await this.getDecryptedNote(hash)
          Assert.isNotUndefined(note)
          if (!note.spent) {
            confirmed -= note.note.value()
          }
        }
      }
    }

    for (const noteHash of this.nonChainNoteHashes) {
      const note = await this.getDecryptedNote(noteHash)
      Assert.isNotUndefined(note)
      if (!note.spent) {
        confirmed -= note.note.value()
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

export function calculateAccountPrefix(id: string): Buffer {
  const prefix = Buffer.alloc(4)
  const prefixHash = new MurmurHash3(id, 1).result()
  prefix.writeUInt32BE(prefixHash)
  return prefix
}
