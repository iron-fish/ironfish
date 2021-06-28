/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { WasmNote } from 'ironfish-wasm-nodejs'

export class IronfishNote {
  private readonly wasmNoteSerialized: Buffer
  private wasmNote: WasmNote | null = null
  private referenceCount = 0

  constructor(wasmNoteSerialized: Buffer) {
    this.wasmNoteSerialized = wasmNoteSerialized
  }

  serialize(): Buffer {
    return this.wasmNoteSerialized
  }

  takeReference(): WasmNote {
    this.referenceCount++
    if (this.wasmNote === null) {
      this.wasmNote = WasmNote.deserialize(this.wasmNoteSerialized)
    }
    return this.wasmNote
  }

  returnReference(): void {
    this.referenceCount--
    if (this.referenceCount <= 0) {
      this.referenceCount = 0
      this.wasmNote?.free()
      this.wasmNote = null
    }
  }

  value(): bigint {
    const value = this.takeReference().value
    this.returnReference()
    return value.valueOf()
  }

  memo(): string {
    const memo = this.takeReference().memo
    this.returnReference()
    return memo
  }

  nullifier(ownerPrivateKey: string, position: BigInt): Buffer {
    const buf = Buffer.from(this.takeReference().nullifier(ownerPrivateKey, position))
    this.returnReference()
    return buf
  }
}
