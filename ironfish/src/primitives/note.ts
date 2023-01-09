/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  ASSET_ID_LENGTH,
  MEMO_LENGTH,
  Note as NativeNote,
  PUBLIC_ADDRESS_LENGTH,
  RANDOMNESS_LENGTH,
} from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { BufferUtils } from '../utils/buffer'

export class Note {
  private readonly noteSerialized: Buffer
  private note: NativeNote | null = null
  private referenceCount = 0

  private readonly _value: bigint
  private readonly _memo: Buffer
  private readonly _assetId: Buffer
  private readonly _sender: string

  constructor(noteSerialized: Buffer) {
    this.noteSerialized = noteSerialized

    const reader = bufio.read(this.noteSerialized, true)

    // skip owner public address
    reader.seek(PUBLIC_ADDRESS_LENGTH)

    this._assetId = reader.readBytes(ASSET_ID_LENGTH, true)

    this._value = reader.readBigU64()

    // skip randomness
    reader.seek(RANDOMNESS_LENGTH)

    this._memo = reader.readBytes(MEMO_LENGTH, true)

    this._sender = reader.readBytes(PUBLIC_ADDRESS_LENGTH, true).toString('hex')
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

  sender(): string {
    return this._sender
  }

  memo(): string {
    return BufferUtils.toHuman(this._memo)
  }

  assetId(): Buffer {
    return this._assetId
  }

  nullifier(ownerPrivateKey: string, position: bigint): Buffer {
    const buf = this.takeReference().nullifier(ownerPrivateKey, position)
    this.returnReference()
    return buf
  }

  equals(other: Note): boolean {
    return this.noteSerialized.equals(other.noteSerialized)
  }
}
