/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IronfishNoteEncrypted, WasmNoteEncryptedHash } from './noteEncrypted'
import { Nullifier } from './nullifier'
import { Serde } from '../serde'
import { Validity, VerificationResult, VerificationResultReason } from '../consensus/verifier'
import { WasmTransactionPosted } from 'ironfish-wasm-nodejs'
import { WorkerPool } from '../workerPool'

export type TransactionHash = Buffer
export type SerializedTransaction = Buffer

export interface Spend<H> {
  nullifier: Nullifier
  commitment: H
  size: number
}

export interface Transaction<E, H> {
  /**
   * Verify whether the transaction has valid proofs.
   */
  verify(): Promise<VerificationResult>

  /**
   * The number of notes in the transaction.
   */
  notesLength(): number

  /**
   * Iterate over all the notes created by this transaction.
   */
  notes(): Iterable<E>

  /**
   * The number of spends in the transaction.
   */
  spendsLength(): number

  /**
   * Iterate over all the spends in the transaction. A spend includes a nullifier,
   * indicating that a note was spent, and a commitment committing to
   * the root hash and tree size at the time the note was spent.
   */
  spends(): Iterable<Spend<H>>

  /**
   * Preallocate any resources necessary for using the transaction.
   */
  takeReference(): unknown

  /**
   * Return any resources necessary for using the transaction.
   */
  returnReference(): void

  /**
   * Wraps the given callback in takeReference and returnReference.
   */
  withReference<R>(callback: (transaction: unknown) => R): R

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
  transactionFee(): Promise<bigint>

  /**
   * Get transaction signature for this transaction.
   */
  transactionSignature(): Buffer

  /**
   * Get the transaction hash.
   */
  transactionHash(): Buffer
}

export class IronfishTransaction
  implements Transaction<IronfishNoteEncrypted, WasmNoteEncryptedHash> {
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

  takeReference(): WasmTransactionPosted {
    this.referenceCount++
    if (this.wasmTransactionPosted === null) {
      this.wasmTransactionPosted = WasmTransactionPosted.deserialize(
        this.wasmTransactionPostedSerialized,
      )
    }
    return this.wasmTransactionPosted
  }

  returnReference(): void {
    this.referenceCount--
    if (this.referenceCount <= 0) {
      this.referenceCount = 0
      this.wasmTransactionPosted?.free()
      this.wasmTransactionPosted = null
    }
  }

  withReference<R>(callback: (transaction: WasmTransactionPosted) => R): R {
    const transaction = this.takeReference()
    try {
      return callback(transaction)
    } finally {
      this.returnReference()
    }
  }

  async verify(): Promise<VerificationResult> {
    const result = await this.workerPool.verify(this)
    return result === true
      ? { valid: Validity.Yes }
      : { valid: Validity.No, reason: VerificationResultReason.ERROR }
  }

  notesLength(): number {
    return this.withReference((t) => t.notesLength)
  }

  getNote(index: number): IronfishNoteEncrypted {
    return this.withReference((t) => {
      // Get the note
      const serializedNote = Buffer.from(t.getNote(index))

      // Convert it to an IronfishNoteEncrypted
      return new IronfishNoteEncrypted(serializedNote)
    })
  }

  *notes(): Iterable<IronfishNoteEncrypted> {
    const notesLength = this.notesLength()

    for (let i = 0; i < notesLength; i++) {
      yield this.getNote(i)
    }
  }

  spendsLength(): number {
    return this.withReference((t) => t.spendsLength)
  }

  *spends(): Iterable<Spend<WasmNoteEncryptedHash>> {
    const spendsLength = this.spendsLength()
    for (let i = 0; i < spendsLength; i++) {
      yield this.withReference((t) => {
        const wasmSpend = t.getSpend(i)
        const spend: Spend<WasmNoteEncryptedHash> = {
          size: wasmSpend.treeSize,
          nullifier: Buffer.from(wasmSpend.nullifier),
          commitment: Buffer.from(wasmSpend.rootHash),
        }
        wasmSpend.free()
        return spend
      })
    }
  }

  transactionFee(): Promise<bigint> {
    return this.workerPool.transactionFee(this)
  }

  transactionSignature(): Buffer {
    return this.withReference((t) => Buffer.from(t.transactionSignature))
  }

  transactionHash(): TransactionHash {
    return this.withReference((t) => Buffer.from(t.transactionHash))
  }
}

/**
 * Serializer and equality checker for Transaction wrappers.
 */
export class TransactionSerde implements Serde<IronfishTransaction, SerializedTransaction> {
  constructor(private readonly workerPool: WorkerPool) {}

  equals(): boolean {
    throw new Error(`Not implemented`)
  }

  serialize(transaction: IronfishTransaction): SerializedTransaction {
    return transaction.serialize()
  }

  deserialize(data: SerializedTransaction): IronfishTransaction {
    return new IronfishTransaction(data, this.workerPool)
  }
}
