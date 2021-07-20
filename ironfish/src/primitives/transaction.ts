/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { WasmTransactionPosted } from 'ironfish-wasm-nodejs'
import { VerificationResult, VerificationResultReason } from '../consensus/verifier'
import { Serde } from '../serde'
import { WorkerPool } from '../workerPool'
import { NoteEncrypted } from './noteEncrypted'
import { Spend } from './spend'

export type TransactionHash = Buffer

export type SerializedTransaction = Buffer

export class Transaction {
  private readonly wasmTransactionPostedSerialized: Buffer
  private readonly workerPool: WorkerPool

  private wasmTransactionPosted: WasmTransactionPosted | null = null
  private referenceCount = 0

  constructor(wasmTransactionPostedSerialized: Buffer, workerPool: WorkerPool) {
    this.wasmTransactionPostedSerialized = wasmTransactionPostedSerialized
    this.workerPool = workerPool
  }

  serialize(): Buffer {
    return this.wasmTransactionPostedSerialized
  }

  /**
   * Preallocate any resources necessary for using the transaction.
   */
  takeReference(): WasmTransactionPosted {
    this.referenceCount++
    if (this.wasmTransactionPosted === null) {
      this.wasmTransactionPosted = WasmTransactionPosted.deserialize(
        this.wasmTransactionPostedSerialized,
      )
    }
    return this.wasmTransactionPosted
  }

  /**
   * Return any resources necessary for using the transaction.
   */
  returnReference(): void {
    this.referenceCount--
    if (this.referenceCount <= 0) {
      this.referenceCount = 0
      this.wasmTransactionPosted?.free()
      this.wasmTransactionPosted = null
    }
  }

  /**
   * Wraps the given callback in takeReference and returnReference.
   */
  withReference<R>(callback: (transaction: WasmTransactionPosted) => R): R {
    const transaction = this.takeReference()
    try {
      return callback(transaction)
    } finally {
      this.returnReference()
    }
  }

  /**
   * Verify whether the transaction has valid proofs.
   */
  async verify(): Promise<VerificationResult> {
    const result = await this.workerPool.verify(this)

    return result === true
      ? { valid: true }
      : { valid: false, reason: VerificationResultReason.ERROR }
  }

  /**
   * The number of notes in the transaction.
   */
  notesLength(): number {
    return this.withReference((t) => t.notesLength)
  }

  getNote(index: number): NoteEncrypted {
    return this.withReference((t) => {
      const serializedNote = Buffer.from(t.getNote(index))
      return new NoteEncrypted(serializedNote)
    })
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
    return this.withReference((t) => t.spendsLength)
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
      const wasmSpend = t.getSpend(index)

      const spend = {
        size: wasmSpend.treeSize,
        nullifier: Buffer.from(wasmSpend.nullifier),
        commitment: Buffer.from(wasmSpend.rootHash),
      }

      wasmSpend.free()
      return spend
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
  transactionFee(): Promise<bigint> {
    return this.workerPool.transactionFee(this)
  }

  /**
   * Get transaction signature for this transaction.
   */
  transactionSignature(): Buffer {
    return this.withReference((t) => Buffer.from(t.transactionSignature))
  }

  /**
   * Get the transaction hash.
   */
  transactionHash(): TransactionHash {
    return this.withReference((t) => Buffer.from(t.transactionHash))
  }

  equals(other: Transaction): boolean {
    return this.transactionHash().equals(other.transactionHash())
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
