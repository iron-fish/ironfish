/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferMap } from 'buffer-map'
import MurmurHash3 from 'imurmurhash'
import { Assert } from '../assert'
import { BlockHeader, Transaction } from '../primitives'
import { GENESIS_BLOCK_SEQUENCE } from '../primitives/block'
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
    await this.walletDb.clearBalance(this, tx)
  }

  async *getNotes(): AsyncGenerator<DecryptedNoteValue & { hash: Buffer }> {
    for await (const decryptedNote of this.walletDb.loadDecryptedNotes(this)) {
      yield decryptedNote
    }
  }

  async *getUnspentNotes(
    assetIdentifier: Buffer,
  ): AsyncGenerator<DecryptedNoteValue & { hash: Buffer }> {
    for await (const decryptedNote of this.getNotes()) {
      if (!decryptedNote.note.assetIdentifier().equals(assetIdentifier)) {
        continue
      }

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
      const existingNote = await this.getDecryptedNote(noteHash, tx)

      if (existingNote && existingNote.nullifier !== null && note.nullifier == null) {
        await this.walletDb.deleteNullifier(this, existingNote.nullifier, tx)
      }

      await this.walletDb.saveDecryptedNote(this, noteHash, note, tx)
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

      await this.bulkUpdateDecryptedNotes(
        transactionHash,
        decryptedNotes,
        blockHash,
        sequence,
        tx,
      )
      await this.processTransactionSpends(transaction, tx)
    })
  }

  async connectTransaction(
    blockHeader: BlockHeader,
    transaction: Transaction,
    decryptedNotes: Array<DecryptedNote>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const balanceDeltas = new AssetBalanceDeltas()

    await this.walletDb.db.withTransaction(tx, async (tx) => {
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
          blockHash: blockHeader.hash,
          sequence: blockHeader.sequence,
        }

        balanceDeltas.increment(note.note.assetIdentifier(), note.note.value())

        await this.walletDb.saveDecryptedNote(this, decryptedNote.hash, note, tx)
      }

      for (const spend of transaction.spends) {
        const spentNoteHash = await this.getNoteHash(spend.nullifier, tx)
        if (!spentNoteHash) {
          continue
        }

        const note = await this.getDecryptedNote(spentNoteHash, tx)

        Assert.isNotUndefined(note)

        balanceDeltas.increment(note.note.assetIdentifier(), -note.note.value())

        const spentNote = { ...note, spent: true }
        await this.walletDb.saveDecryptedNote(this, spentNoteHash, spentNote, tx)
      }

      await this.walletDb.saveTransaction(
        this,
        transaction.hash(),
        {
          transaction,
          blockHash: blockHeader.hash,
          sequence: blockHeader.sequence,
          submittedSequence: blockHeader.sequence,
        },
        tx,
      )

      await this.updateUnconfirmedBalances(balanceDeltas, tx)
    })
  }

  async addPendingTransaction(
    transaction: Transaction,
    decryptedNotes: Array<DecryptedNote>,
    submittedSequence: number | null,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
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

        await this.walletDb.saveDecryptedNote(this, decryptedNote.hash, note, tx)
      }

      for (const spend of transaction.spends) {
        const spentNoteHash = await this.getNoteHash(spend.nullifier, tx)
        if (!spentNoteHash) {
          continue
        }

        const note = await this.getDecryptedNote(spentNoteHash, tx)

        Assert.isNotUndefined(note)

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
        },
        tx,
      )
    })
  }

  async updateTransaction(
    hash: Buffer,
    transactionValue: TransactionValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.walletDb.db.withTransaction(tx, async (tx) => {
      await this.walletDb.saveTransaction(this, hash, transactionValue, tx)
    })
  }

  // TODO(hughy): this method is now only called when blocks are removed from the chain
  // this method now updates the balance when blocks are removed but will be removed once disconnect is implemented
  private async bulkUpdateDecryptedNotes(
    transactionHash: Buffer,
    decryptedNotes: Array<DecryptedNote>,
    blockHash: Buffer | null,
    sequence: number | null,
    tx?: IDatabaseTransaction,
  ) {
    await this.walletDb.db.withTransaction(tx, async (tx) => {
      const balanceDeltas = new AssetBalanceDeltas()
      for (const decryptedNote of decryptedNotes) {
        if (decryptedNote.forSpender) {
          continue
        }

        if (decryptedNote.nullifier !== null) {
          await this.walletDb.saveNullifierNoteHash(
            this,
            decryptedNote.nullifier,
            decryptedNote.hash,
            tx,
          )
        }

        const note = new Note(decryptedNote.serializedNote)
        balanceDeltas.increment(note.assetIdentifier(), -note.value())

        await this.updateDecryptedNote(
          decryptedNote.hash,
          {
            accountId: this.id,
            nullifier: decryptedNote.nullifier,
            index: decryptedNote.index,
            note,
            spent: false,
            transactionHash,
            blockHash,
            sequence,
          },
          tx,
        )
      }

      await this.updateUnconfirmedBalances(balanceDeltas, tx)
    })
  }

  // TODO(hughy): this method is now only called when a block is disconnected
  // this method now updates the balance when blocks are removed but will be removed once disconnect is implemented
  private async processTransactionSpends(
    transaction: Transaction,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const balanceDeltas = new AssetBalanceDeltas()
    for (const spend of transaction.spends) {
      const noteHash = await this.getNoteHash(spend.nullifier, tx)

      if (noteHash) {
        const decryptedNote = await this.getDecryptedNote(noteHash, tx)
        Assert.isNotUndefined(
          decryptedNote,
          'nullifierToNote mappings must have a corresponding decryptedNote',
        )

        await this.updateDecryptedNote(
          noteHash,
          {
            ...decryptedNote,
            spent: true,
          },
          tx,
        )

        balanceDeltas.increment(
          decryptedNote.note.assetIdentifier(),
          -decryptedNote.note.value(),
        )
      }
    }

    await this.updateUnconfirmedBalances(balanceDeltas, tx)
  }

  private async deleteDecryptedNote(
    noteHash: Buffer,
    transactionHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.walletDb.db.withTransaction(tx, async (tx) => {
      const existingNote = await this.getDecryptedNote(noteHash, tx)

      if (existingNote) {
        await this.walletDb.deleteDecryptedNote(this, noteHash, tx)
      }

      const record = await this.getTransaction(transactionHash, tx)
      await this.walletDb.deleteNoteHashSequence(this, noteHash, record?.sequence ?? null, tx)
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

  getTransactions(tx?: IDatabaseTransaction): AsyncGenerator<Readonly<TransactionValue>> {
    return this.walletDb.loadTransactions(this, tx)
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

  async expireTransaction(transaction: Transaction, tx?: IDatabaseTransaction): Promise<void> {
    const transactionHash = transaction.hash()

    await this.walletDb.db.withTransaction(tx, async (tx) => {
      for (const note of transaction.notes) {
        const noteHash = note.merkleHash()
        const decryptedNote = await this.getDecryptedNote(noteHash, tx)

        if (decryptedNote) {
          await this.deleteDecryptedNote(noteHash, transactionHash, tx)

          if (decryptedNote.nullifier) {
            await this.walletDb.deleteNullifier(this, decryptedNote.nullifier, tx)
          }
        }
      }

      for (const spend of transaction.spends) {
        const noteHash = await this.getNoteHash(spend.nullifier, tx)

        if (noteHash) {
          const decryptedNote = await this.getDecryptedNote(noteHash, tx)
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
   * unconfirmed: all notes on the chain
   * confirmed: confirmed balance minus notes in unconfirmed range
   */
  async getBalance(
    headSequence: number,
    assetIdentifier: Buffer,
    minimumBlockConfirmations: number,
    tx?: IDatabaseTransaction,
  ): Promise<{
    unconfirmed: bigint
    unconfirmedCount: number
    confirmed: bigint
  }> {
    let unconfirmedCount = 0

    const unconfirmed = await this.getUnconfirmedBalance(assetIdentifier, tx)

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
        if (!note.note.assetIdentifier().equals(assetIdentifier)) {
          continue
        }

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
    }
  }

  async getUnconfirmedBalances(tx?: IDatabaseTransaction): Promise<BufferMap<bigint>> {
    const unconfirmedBalances = new BufferMap<bigint>()
    for await (const { assetIdentifier, balance } of this.walletDb.getUnconfirmedBalances(
      this,
      tx,
    )) {
      unconfirmedBalances.set(assetIdentifier, balance)
    }
    return unconfirmedBalances
  }

  async getUnconfirmedBalance(
    assetIdentifier: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<bigint> {
    return this.walletDb.getUnconfirmedBalance(this, assetIdentifier, tx)
  }

  async updateUnconfirmedBalances(
    balanceDeltas: BufferMap<bigint>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    for (const [assetIdentifier, balanceDelta] of balanceDeltas) {
      const currentUnconfirmedBalance = await this.getUnconfirmedBalance(assetIdentifier, tx)

      await this.walletDb.saveUnconfirmedBalance(
        this,
        assetIdentifier,
        currentUnconfirmedBalance + balanceDelta,
        tx,
      )
    }
  }

  async saveUnconfirmedBalance(
    assetIdentifier: Buffer,
    balance: bigint,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.walletDb.saveUnconfirmedBalance(this, assetIdentifier, balance, tx)
  }

  async getHeadHash(tx?: IDatabaseTransaction): Promise<Buffer | null> {
    return this.walletDb.getHeadHash(this, tx)
  }

  async getTransactionNotes(
    transaction: Transaction,
  ): Promise<Array<DecryptedNoteValue & { hash: Buffer }>> {
    const notes = []

    for (const note of transaction.notes) {
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

class AssetBalanceDeltas extends BufferMap<bigint> {
  increment(assetIdentifier: Buffer, delta: bigint): void {
    const currentDelta = this.get(assetIdentifier) ?? 0n
    this.set(assetIdentifier, currentDelta + delta)
  }
}
