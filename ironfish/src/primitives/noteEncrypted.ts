/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { WasmNoteEncrypted } from 'ironfish-wasm-nodejs'
import { Serde } from '../serde'
import { Note } from './note'

export type WasmNoteEncryptedHash = Buffer
export type SerializedWasmNoteEncryptedHash = Buffer
export type SerializedWasmNoteEncrypted = Buffer

export class NoteEncrypted {
  private readonly wasmNoteEncryptedSerialized: Buffer
  private wasmNoteEncrypted: WasmNoteEncrypted | null = null
  private referenceCount = 0

  constructor(wasmNoteEncryptedSerialized: Buffer) {
    this.wasmNoteEncryptedSerialized = wasmNoteEncryptedSerialized
  }

  serialize(): Buffer {
    return this.wasmNoteEncryptedSerialized
  }

  takeReference(): WasmNoteEncrypted {
    this.referenceCount++
    if (this.wasmNoteEncrypted === null) {
      this.wasmNoteEncrypted = WasmNoteEncrypted.deserialize(this.wasmNoteEncryptedSerialized)
    }
    return this.wasmNoteEncrypted
  }

  returnReference(): void {
    this.referenceCount--
    if (this.referenceCount <= 0) {
      this.referenceCount = 0
      this.wasmNoteEncrypted?.free()
      this.wasmNoteEncrypted = null
    }
  }

  decryptNoteForOwner(ownerHexKey: string): Note | undefined {
    const note = this.takeReference().decryptNoteForOwner(ownerHexKey)
    this.returnReference()
    if (note) {
      const serializedNote = note.serialize()
      note.free()
      return new Note(Buffer.from(serializedNote))
    }
  }

  decryptNoteForSpender(spenderHexKey: string): Note | undefined {
    const note = this.takeReference().decryptNoteForSpender(spenderHexKey)
    this.returnReference()
    if (note) {
      const serializedNote = note.serialize()
      note.free()
      return new Note(Buffer.from(serializedNote))
    }
  }

  merkleHash(): Buffer {
    const note = this.takeReference().merkleHash()
    this.returnReference()
    return Buffer.from(note)
  }
}

/**
 * Serde implementation to convert an encrypted note to its serialized form and back.
 */
export class WasmNoteEncryptedSerde
  implements Serde<NoteEncrypted, SerializedWasmNoteEncrypted>
{
  equals(note1: NoteEncrypted, note2: NoteEncrypted): boolean {
    return note1.serialize().equals(note2.serialize())
  }

  serialize(note: NoteEncrypted): SerializedWasmNoteEncrypted {
    return note.serialize()
  }

  deserialize(serializedNote: SerializedWasmNoteEncrypted): NoteEncrypted {
    return new NoteEncrypted(serializedNote)
  }
}

/**
 * Serde implementation to convert an encrypted note's hash to its serialized form and back.
 */
export class WasmNoteEncryptedHashSerde
  implements Serde<WasmNoteEncryptedHash, SerializedWasmNoteEncryptedHash>
{
  equals(hash1: WasmNoteEncryptedHash, hash2: WasmNoteEncryptedHash): boolean {
    return hash1.equals(hash2)
  }
  serialize(note: WasmNoteEncryptedHash): SerializedWasmNoteEncryptedHash {
    return note
  }
  deserialize(serializedNote: SerializedWasmNoteEncryptedHash): WasmNoteEncryptedHash {
    return serializedNote
  }
}
