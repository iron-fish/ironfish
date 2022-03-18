/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TransactionPosted } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { VerificationResult, VerificationResultReason } from '../consensus/verifier'
import { Serde } from '../serde'
import { WorkerPool } from '../workerPool'
import { VerifyTransactionOptions } from '../workerPool/tasks/verifyTransaction'
import { NoteEncrypted } from './noteEncrypted'
import { Spend } from './spend'

export type TransactionHash = Buffer

export type SerializedTransaction = Buffer

export class Transaction {
  private readonly transactionPostedSerialized: Buffer
  private readonly workerPool: WorkerPool

  private readonly _spendsLength: number
  private readonly _notesLength: number
  private readonly _fee: bigint
  private readonly _expirationSequence: number
  private readonly _spends: Buffer[]
  private readonly _notes: Buffer[]
  private readonly _signature: Buffer

  private transactionPosted: TransactionPosted | null = null
  private referenceCount = 0

  constructor(transactionPostedSerialized: Buffer, workerPool: WorkerPool) {
    this.transactionPostedSerialized = transactionPostedSerialized

    const reader = bufio.read(this.transactionPostedSerialized, true)
    this._spendsLength = reader.readU64()
    this._notesLength = reader.readU64()
    this._fee = BigInt(reader.readI64())
    this._expirationSequence = reader.readU32()
    this._spends = Array.from({ length: this._spendsLength }, () => {
      return reader.readBytes(388, true)
    })
    this._notes = Array.from({ length: this._notesLength }, () => {
      return reader.readBytes(275, true)
    })
    this._signature = reader.readBytes(64, true)

    this.workerPool = workerPool
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
   * Verify whether the transaction has valid proofs.
   */
  async verify(options?: VerifyTransactionOptions): Promise<VerificationResult> {
    const result = await this.workerPool.verify(this, options)

    return result === true
      ? { valid: true }
      : { valid: false, reason: VerificationResultReason.ERROR }
  }

  /**
   * The number of notes in the transaction.
   */
  notesLength(): number {
    return this._notesLength
  }

  getNote(index: number): NoteEncrypted {
    return new NoteEncrypted(this._notes[index])
  }

  async isMinersFee(): Promise<boolean> {
    return this.spendsLength() === 0 && this.notesLength() === 1 && (await this.fee()) <= 0
  }

  /**
   * Iterate over all the notes created by this transaction.
   */
  *notes(): Iterable<NoteEncrypted> {
    const notesLength = this.notesLength()

    for (let i = 0; i < notesLength; i++) {
      yield this.getNote(i)
    }
  }

  /**
   * The number of spends in the transaction.
   */
  spendsLength(): number {
    return this._spendsLength
  }

  /**
   * Iterate over all the spends in the transaction. A spend includes a nullifier,
   * indicating that a note was spent, and a commitment committing to
   * the root hash and tree size at the time the note was spent.
   */
  *spends(): Iterable<Spend> {
    const spendsLength = this.spendsLength()

    for (let i = 0; i < spendsLength; i++) {
      yield this.getSpend(i)
    }
  }

  getSpend(index: number): Spend {
    return this.withReference((t) => {
      const spend = t.getSpend(index)

      const jsSpend = {
        size: spend.treeSize,
        nullifier: spend.nullifier,
        commitment: spend.rootHash,
      }

      return jsSpend
    })
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
  fee(): Promise<bigint> {
    return Promise.resolve(this._fee)
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
    return this.hash().equals(other.hash())
  }

  expirationSequence(): number {
    return this._expirationSequence
  }
}

/**
 * Serializer and equality checker for Transaction wrappers.
 */
export class TransactionSerde implements Serde<Transaction, SerializedTransaction> {
  constructor(private readonly workerPool: WorkerPool) {}

  equals(tx1: Transaction, tx2: Transaction): boolean {
    return tx1.equals(tx2)
  }

  serialize(transaction: Transaction): SerializedTransaction {
    return transaction.serialize()
  }

  deserialize(data: SerializedTransaction): Transaction {
    return new Transaction(data, this.workerPool)
  }
}
