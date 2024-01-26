/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { UnsignedTransaction as NativeUnsignedTransaction } from '@ironfish/rust-nodejs'

export class UnsignedTransaction {
  private readonly unsignedTransactionSerialized: Buffer
  private referenceCount = 0
  private nativeUnsignedTransaction: NativeUnsignedTransaction | null = null

  constructor(unsignedTransactionSerialized: Buffer) {
    this.unsignedTransactionSerialized = unsignedTransactionSerialized
  }

  serialize(): Buffer {
    return this.unsignedTransactionSerialized
  }

  /**
   * Preallocate any resources necessary for using the transaction.
   */
  takeReference(): NativeUnsignedTransaction {
    this.referenceCount++
    if (this.nativeUnsignedTransaction === null) {
      this.nativeUnsignedTransaction = new NativeUnsignedTransaction(
        this.unsignedTransactionSerialized,
      )
    }
    return this.nativeUnsignedTransaction
  }

  /**
   * Return any resources necessary for using the transaction.
   */
  returnReference(): void {
    this.referenceCount--
    if (this.referenceCount <= 0) {
      this.referenceCount = 0
      this.nativeUnsignedTransaction = null
    }
  }

  /**
   * Wraps the given callback in takeReference and returnReference.
   */
  withReference<R>(callback: (transaction: NativeUnsignedTransaction) => R): R {
    const transaction = this.takeReference()

    const result = callback(transaction)

    void Promise.resolve(result).finally(() => {
      this.returnReference()
    })

    return result
  }
}
