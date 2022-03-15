/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Note as NativeNote } from '@ironfish/rust-nodejs'

export class Note {
  private readonly noteSerialized: Buffer
  private note: NativeNote | null = null
  private referenceCount = 0

  constructor(noteSerialized: Buffer) {
    this.noteSerialized = noteSerialized
  }

  serialize(): Buffer {
    return this.noteSerialized
  }

  takeReference(): NativeNote {
    this.referenceCount++
    if (this.note === null) {
      this.note = NativeNote.deserialize(this.noteSerialized)
    }
    return this.note
  }

  returnReference(): void {
    this.referenceCount--
    if (this.referenceCount <= 0) {
      this.referenceCount = 0
      this.note = null
    }
  }

  value(): bigint {
    const value = this.takeReference().value()
    this.returnReference()
    return value
  }

  memo(): string {
    const memo = this.takeReference().memo()
    this.returnReference()
    return memo
  }

  nullifier(ownerPrivateKey: string, position: bigint): Buffer {
    const buf = Buffer.from(this.takeReference().nullifier(ownerPrivateKey, position))
    this.returnReference()
    return buf
  }
}
