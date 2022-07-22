/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MinersFeeTransaction as NativeMinersFeeTransaction } from '@ironfish/rust-nodejs'
import { NoteEncrypted } from '../noteEncrypted'
import { Spend } from '../spend'
import { Transaction, TransactionType } from './transaction'

export class MinersFeeTransaction extends Transaction {
  private readonly serializedTransaction: Buffer
  private referenceCount = 0
  private nativeTransaction: NativeMinersFeeTransaction | null

  constructor(serializedTransaction: Buffer) {
    super(TransactionType.MinersFee)
    this.serializedTransaction = serializedTransaction
    this.nativeTransaction = null
  }

  expirationSequence(): number {
    return 0
  }

  fee(): bigint {
    return NativeMinersFeeTransaction.deserialize(this.serializedTransaction).fee()
  }

  hash(): Buffer {
    return NativeMinersFeeTransaction.deserialize(this.serializedTransaction).hash()
  }

  notes(): NoteEncrypted[] {
    const note = NativeMinersFeeTransaction.deserialize(this.serializedTransaction).getNote()
    return [new NoteEncrypted(note)]
  }

  signature(): Buffer {
    throw new Error('Not implemented')
  }

  spends(): Spend[] {
    return []
  }

  unsignedHash(): Buffer {
    throw new Error('Not implemented')
  }

  serialize(): Buffer {
    return this.serializedTransaction
  }

  withReference<R>(callback: (transaction: NativeMinersFeeTransaction) => R): R {
    const transaction = this.takeReference()

    const result = callback(transaction)

    Promise.resolve(result).finally(() => {
      this.returnReference()
    })

    return result
  }

  private takeReference(): NativeMinersFeeTransaction {
    this.referenceCount++
    if (this.nativeTransaction === null) {
      this.nativeTransaction = NativeMinersFeeTransaction.deserialize(this.serializedTransaction)
    }
    return this.nativeTransaction
  }

  private returnReference(): void {
    this.referenceCount--
    if (this.referenceCount <= 0) {
      this.referenceCount = 0
      this.nativeTransaction = null
    }
  }
}
