/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Note as NativeNote } from '@ironfish/rust-nodejs'
import bufio from 'bufio'

export const NOTE_LENGTH = 43 + 8 + 32 + 32

export class Note {
  private readonly noteSerialized: Buffer
  private note: NativeNote | null = null
  private referenceCount = 0

  private readonly _value: bigint
  private readonly _memo: Buffer

  constructor(noteSerialized: Buffer) {
    this.noteSerialized = noteSerialized

    const reader = bufio.read(this.noteSerialized, true)

    // skip owner
    reader.seek(43)

    this._value = BigInt(reader.readU64())

    // skip randomness
    reader.seek(32)

    this._memo = reader.readBytes(32, true)
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
    return this._value
  }

  memo(): string {
    return this._memo.toString('utf8')
  }

  nullifier(ownerPrivateKey: string, position: bigint): Buffer {
    const buf = this.takeReference().nullifier(ownerPrivateKey, position)
    this.returnReference()
    return buf
  }
}
