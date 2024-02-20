/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  NativeBurnDescription,
  NativeMintDescription,
  UnsignedTransaction as NativeUnsignedTransaction,
} from '@ironfish/rust-nodejs'
import { Note } from './note'
import { NoteEncrypted } from './noteEncrypted'

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

  descriptions(
    incomingViewKey: string,
    outgoingViewKey: string,
  ): {
    receivedNotes: Note[]
    sentNotes: Note[]
    mints: NativeMintDescription[]
    burns: NativeBurnDescription[]
  } {
    const descriptions = this.takeReference().descriptions()
    this.returnReference()

    const receivedNotes = []
    const sentNotes = []
    for (const serializedOutput of descriptions.outputs) {
      const note = new NoteEncrypted(serializedOutput)

      const receivedNote = note.decryptNoteForOwner(incomingViewKey)
      if (receivedNote) {
        receivedNotes.push(receivedNote)
      }

      const sentNote = note.decryptNoteForSpender(outgoingViewKey)
      if (sentNote) {
        sentNotes.push(sentNote)
      }
    }

    return {
      receivedNotes,
      sentNotes,
      mints: descriptions.mints,
      burns: descriptions.burns,
    }
  }
}
