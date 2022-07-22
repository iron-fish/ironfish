/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferMap } from 'buffer-map'
import MurmurHash3 from 'imurmurhash'
import { Assert } from '../assert'
import { Transaction } from '../primitives'
import { Note } from '../primitives/note'
import { IDatabaseTransaction } from '../storage'
import { SyncTransactionParams } from './accounts'
import { AccountsDB } from './accountsdb'
import { AccountsValue } from './database/accounts'
import { DecryptedNotesValue } from './database/decryptedNotes'

export const ACCOUNT_KEY_LENGTH = 32

export class Account {
  private readonly accountsDb: AccountsDB
  private readonly decryptedNotes: Map<string, DecryptedNotesValue>
  private readonly nullifierToNoteHash: Map<string, string>
  private readonly transactions: BufferMap<
    Readonly<{
      transaction: Transaction
      blockHash: string | null
      submittedSequence: number | null
    }>
  >

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
    this.decryptedNotes = new Map<string, DecryptedNotesValue>()
    this.nullifierToNoteHash = new Map<string, string>()
    this.transactions = new BufferMap<{
      transaction: Transaction
      blockHash: string | null
      submittedSequence: number | null
    }>()
  }

  serialize(): AccountsValue {
    return {
      name: this.name,
      spendingKey: this.spendingKey,
      incomingViewKey: this.incomingViewKey,
      outgoingViewKey: this.outgoingViewKey,
      publicAddress: this.publicAddress,
    }
  }

  async load(): Promise<void> {
    await this.loadDecryptedNotesAndBalance()
    await this.accountsDb.loadNullifierToNoteHash(this.nullifierToNoteHash)
    await this.accountsDb.loadTransactions(this.transactions)
  }

  private async loadDecryptedNotesAndBalance(): Promise<void> {
    let unconfirmedBalance = BigInt(0)

    for await (const { hash, decryptedNote } of this.accountsDb.loadDecryptedNotes()) {
      this.decryptedNotes.set(hash, decryptedNote)

      if (!decryptedNote.spent) {
        unconfirmedBalance += new Note(decryptedNote.serializedNote).value()
      }
    }

    await this.saveUnconfirmedBalance(unconfirmedBalance)
  }

  async save(): Promise<void> {
    await this.accountsDb.replaceDecryptedNotes(this.decryptedNotes)
    await this.accountsDb.replaceNullifierToNoteHash(this.nullifierToNoteHash)
    await this.accountsDb.replaceTransactions(this.transactions)
  }

  async reset(): Promise<void> {
    this.decryptedNotes.clear()
    this.nullifierToNoteHash.clear()
    this.transactions.clear()
    await this.saveUnconfirmedBalance(BigInt(0))
  }

  getUnspentNotes(): ReadonlyArray<{
    hash: string
    index: number | null
    note: Note
    transactionHash: Buffer
  }> {
    const unspentNotes = []

    for (const [hash, { noteIndex, serializedNote, spent, transactionHash }] of this
      .decryptedNotes) {
      if (!spent) {
        unspentNotes.push({
          hash,
          index: noteIndex,
          note: new Note(serializedNote),
          transactionHash,
        })
      }
    }

    return unspentNotes
  }

  getDecryptedNote(hash: string): DecryptedNotesValue | undefined {
    return this.decryptedNotes.get(hash)
  }

  async updateDecryptedNote(
    noteHash: string,
    note: Readonly<DecryptedNotesValue>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
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

    this.decryptedNotes.set(noteHash, note)
    await this.accountsDb.saveDecryptedNote(noteHash, note, tx)
  }

  async syncTransaction(
    transaction: Transaction,
    decryptedNotes: Array<{
      noteIndex: number | null
      nullifier: string | null
      merkleHash: string
      forSpender: boolean
      account: Account
      serializedNote: Buffer
    }>,
    params: SyncTransactionParams,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    const transactionHash = transaction.unsignedHash()
    const blockHash = 'blockHash' in params ? params.blockHash : null
    let submittedSequence = 'submittedSequence' in params ? params.submittedSequence : null

    const record = this.transactions.get(transactionHash)
    if (record) {
      submittedSequence = record.submittedSequence
    }

    if (!record || !record.transaction.equals(transaction) || record.blockHash !== blockHash) {
      await this.updateTransaction(
        transactionHash,
        { transaction, blockHash, submittedSequence },
        tx,
      )
    }

    const isRemovingTransaction = submittedSequence === null && blockHash === null
    await this.bulkUpdateDecryptedNotes(transactionHash, decryptedNotes, tx)
    await this.processTransactionSpends(transaction, isRemovingTransaction, tx)
  }

  async updateTransaction(
    hash: Buffer,
    transactionValue: {
      transaction: Transaction
      blockHash: string | null
      submittedSequence: number | null
    },
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    this.transactions.set(hash, transactionValue)
    await this.accountsDb.saveTransaction(hash, transactionValue, tx)
  }

  private async bulkUpdateDecryptedNotes(
    transactionHash: Buffer,
    decryptedNotes: Array<{
      noteIndex: number | null
      nullifier: string | null
      merkleHash: string
      forSpender: boolean
      serializedNote: Buffer
    }>,
    tx: IDatabaseTransaction,
  ) {
    for (const {
      noteIndex,
      nullifier,
      forSpender,
      merkleHash,
      serializedNote,
    } of decryptedNotes) {
      if (!forSpender) {
        if (nullifier !== null) {
          await this.updateNullifierNoteHash(nullifier, merkleHash, tx)
        }

        await this.updateDecryptedNote(
          merkleHash,
          {
            accountId: this.id,
            nullifierHash: nullifier,
            noteIndex: noteIndex,
            serializedNote,
            spent: false,
            transactionHash,
          },
          tx,
        )
      }
    }
  }

  private async processTransactionSpends(
    transaction: Transaction,
    isRemovingTransaction: boolean,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    for (const spend of transaction.spends()) {
      const nullifier = spend.nullifier.toString('hex')
      const noteHash = this.getNoteHash(nullifier)

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
    noteHash: string,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
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

    this.decryptedNotes.delete(noteHash)
    await this.accountsDb.deleteDecryptedNote(noteHash, tx)
  }

  getNoteHash(nullifier: string): string | undefined {
    return this.nullifierToNoteHash.get(nullifier)
  }

  async updateNullifierNoteHash(
    nullifier: string,
    noteHash: string,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    this.nullifierToNoteHash.set(nullifier, noteHash)
    await this.accountsDb.saveNullifierNoteHash(nullifier, noteHash, tx)
  }

  async deleteNullifier(nullifier: string, tx?: IDatabaseTransaction): Promise<void> {
    this.nullifierToNoteHash.delete(nullifier)
    await this.accountsDb.deleteNullifier(nullifier, tx)
  }

  getTransaction(hash: Buffer):
    | Readonly<{
        transaction: Transaction
        blockHash: string | null
        submittedSequence: number | null
      }>
    | undefined {
    return this.transactions.get(hash)
  }

  getTransactions(): Generator<
    Readonly<{
      transaction: Transaction
      blockHash: string | null
      submittedSequence: number | null
    }>
  > {
    return this.transactions.values()
  }

  getTransactionsWithMetadata(): Array<{
    creator: boolean
    status: string
    hash: string
    isMinersFee: boolean
    fee: number
    notes: number
    spends: number
  }> {
    const transactions = []

    for (const { blockHash, submittedSequence, transaction } of this.transactions.values()) {
      // check if account created transaction
      let transactionCreator = false
      let transactionRecipient = false

      for (const note of transaction.notes()) {
        if (note.decryptNoteForSpender(this.outgoingViewKey)) {
          transactionCreator = true
          break
        } else if (note.decryptNoteForOwner(this.incomingViewKey)) {
          transactionRecipient = true
        }
      }

      if (transactionCreator || transactionRecipient) {
        transactions.push({
          creator: transactionCreator,
          status: blockHash && submittedSequence ? 'completed' : 'pending',
          hash: transaction.unsignedHash().toString('hex'),
          isMinersFee: transaction.isMinersFee(),
          fee: Number(transaction.fee()),
          notes: transaction.notesLength(),
          spends: transaction.spendsLength(),
        })
      }
    }

    return transactions
  }

  async deleteTransaction(
    hash: Buffer,
    transaction: Transaction,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    for (const note of transaction.notes()) {
      const merkleHash = note.merkleHash().toString('hex')
      const decryptedNote = this.getDecryptedNote(merkleHash)

      if (decryptedNote) {
        await this.deleteDecryptedNote(merkleHash, tx)

        if (decryptedNote.nullifierHash) {
          await this.deleteNullifier(decryptedNote.nullifierHash, tx)
        }
      }
    }

    for (const spend of transaction.spends()) {
      const nullifier = spend.nullifier.toString('hex')
      const noteHash = this.getNoteHash(nullifier)

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

    this.transactions.delete(hash)
    await this.accountsDb.deleteTransaction(hash, tx)
  }

  async getUnconfirmedBalance(): Promise<BigInt> {
    return this.accountsDb.getUnconfirmedBalance(this)
  }

  private async saveUnconfirmedBalance(
    balance: bigint,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.accountsDb.saveUnconfirmedBalance(this, balance, tx)
  }
}
