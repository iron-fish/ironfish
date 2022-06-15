/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TransactionPosted } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { Serde } from '../serde'
import { NoteEncrypted } from './noteEncrypted'
import { Spend } from './spend'

export type TransactionHash = Buffer

export type SerializedTransaction = Buffer

export class Transaction {
  private readonly transactionPostedSerialized: Buffer

  private readonly _fee: bigint
  private readonly _expirationSequence: number
  private readonly _spends: Spend[] = []
  private readonly _notes: NoteEncrypted[]
  private readonly _signature: Buffer

  private transactionPosted: TransactionPosted | null = null
  private referenceCount = 0

  constructor(transactionPostedSerialized: Buffer) {
    this.transactionPostedSerialized = transactionPostedSerialized

    const reader = bufio.read(this.transactionPostedSerialized, true)

    const _spendsLength = reader.readU64() // 8
    const _notesLength = reader.readU64() // 8
    this._fee = BigInt(reader.readI64()) // 8
    this._expirationSequence = reader.readU32() // 4

    this._spends = Array.from({ length: _spendsLength }, () => {
      // proof
      reader.seek(192)
      // value commitment
      reader.seek(32)
      // randomized public key
      reader.seek(32)

      const rootHash = reader.readHash() // 32
      const treeSize = reader.readU32() // 4
      const nullifier = reader.readHash() // 32

      // signature
      reader.seek(64)

      // total serialized size: 192 + 32 + 32 + 32 + 4 + 32 + 64 = 388 bytes
      return {
        size: treeSize,
        commitment: rootHash,
        nullifier,
      }
    })

    this._notes = Array.from({ length: _notesLength }, () => {
      // proof
      reader.seek(192)

      return new NoteEncrypted(reader.readBytes(275, true))
    })

    this._signature = reader.readBytes(64, true)
  }

  serialize(): Buffer {
    return this.transactionPostedSerialized
  }

  /**
   * Preallocate any resources necessary for using the transaction.
   */
  takeReference(): TransactionPosted {
    this.referenceCount++
    if (this.transactionPosted === null) {
      this.transactionPosted = new TransactionPosted(this.transactionPostedSerialized)
    }
    return this.transactionPosted
  }

  /**
   * Return any resources necessary for using the transaction.
   */
  returnReference(): void {
    this.referenceCount--
    if (this.referenceCount <= 0) {
      this.referenceCount = 0
      this.transactionPosted = null
    }
  }

  /**
   * Wraps the given callback in takeReference and returnReference.
   */
  withReference<R>(callback: (transaction: TransactionPosted) => R): R {
    const transaction = this.takeReference()

    const result = callback(transaction)

    Promise.resolve(result).finally(() => {
      this.returnReference()
    })

    return result
  }

  /**
   * The number of notes in the transaction.
   */
  notesLength(): number {
    return this._notes.length
  }

  getNote(index: number): NoteEncrypted {
    return this._notes[index]
  }

  isMinersFee(): boolean {
    return this._spends.length === 0 && this._notes.length === 1 && this._fee <= 0
  }

  /**
   * Iterate over all the notes created by this transaction.
   */
  notes(): Iterable<NoteEncrypted> {
    return this._notes.values()
  }

  /**
   * The number of spends in the transaction.
   */
  spendsLength(): number {
    return this._spends.length
  }

  /**
   * Iterate over all the spends in the transaction. A spend includes a nullifier,
   * indicating that a note was spent, and a commitment committing to
   * the root hash and tree size at the time the note was spent.
   */
  spends(): Iterable<Spend> {
    return this._spends.values()
  }

  getSpend(index: number): Spend {
    return this._spends[index]
  }

  /**
   * Get the transaction fee for this transactions.
   *
   * In general, each transaction has outputs lower than the amount spent; the
   * miner can collect the difference as a transaction fee.
   *
   * In a block header's minersFee transaction, the opposite happens;
   * the miner creates a block with zero spends and output equal to the sum
   * of the miner's fee for the block's transaction, plus the block chain's
   * mining reward.
   *
   * The transaction fee is the difference between outputs and spends on the
   * transaction.
   */
  fee(): bigint {
    return this._fee
  }

  /**
   * Get transaction signature for this transaction.
   */
  transactionSignature(): Buffer {
    return this._signature
  }

  /**
   * Get the transaction hash.
   */
  hash(): TransactionHash {
    return this.withReference((t) => t.hash())
  }

  equals(other: Transaction): boolean {
    return this.transactionPostedSerialized.equals(other.transactionPostedSerialized)
  }

  expirationSequence(): number {
    return this._expirationSequence
  }
}

/**
 * Serializer and equality checker for Transaction wrappers.
 */
export class TransactionSerde implements Serde<Transaction, SerializedTransaction> {
  equals(tx1: Transaction, tx2: Transaction): boolean {
    return tx1.equals(tx2)
  }

  serialize(transaction: Transaction): SerializedTransaction {
    return transaction.serialize()
  }

  deserialize(data: SerializedTransaction): Transaction {
    return new Transaction(data)
  }
}
