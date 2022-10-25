/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { OutputDescription as NativeOutputDescription } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { Serde } from '../serde'
import { Note } from './note'

export type OutputDescriptionHash = Buffer
export type SerializedOutputDescriptionHash = Buffer
export type SerializedOutputDescription = Buffer

export class OutputDescription {
  private readonly noteEncryptedSerialized: Buffer

  private readonly _noteCommitment: Buffer

  private noteEncrypted: NativeOutputDescription | null = null
  private referenceCount = 0

  constructor(noteEncryptedSerialized: Buffer) {
    this.noteEncryptedSerialized = noteEncryptedSerialized

    const reader = bufio.read(noteEncryptedSerialized, true)

    // value commitment
    reader.seek(32)

    // note commitment
    this._noteCommitment = reader.readBytes(32)

    // ephemeral public key
    reader.seek(32)
    // encrypted note
    reader.seek(83)
    // aead MAC
    reader.seek(16)
    // note encryption keys
    reader.seek(64)
    // aead MAC
    reader.seek(16)

    // total serialized size: 192 (proof from transaction)
    // + 32 + 32 + 32 + 83 + 16 + 64 + 16 = 467 bytes
  }

  serialize(): Buffer {
    return this.noteEncryptedSerialized
  }

  takeReference(): NativeOutputDescription {
    this.referenceCount++
    if (this.noteEncrypted === null) {
      this.noteEncrypted = new NativeOutputDescription(this.noteEncryptedSerialized)
    }
    return this.noteEncrypted
  }

  returnReference(): void {
    this.referenceCount--
    if (this.referenceCount <= 0) {
      this.referenceCount = 0
      this.noteEncrypted = null
    }
  }

  decryptNoteForOwner(ownerHexKey: string): Note | undefined {
    const note = this.takeReference().decryptNoteForOwner(ownerHexKey)
    this.returnReference()
    if (note) {
      return new Note(note)
    }
  }

  decryptNoteForSpender(spenderHexKey: string): Note | undefined {
    const note = this.takeReference().decryptNoteForSpender(spenderHexKey)
    this.returnReference()
    if (note) {
      return new Note(note)
    }
  }

  merkleHash(): OutputDescriptionHash {
    return this._noteCommitment
  }

  equals(other: OutputDescription): boolean {
    return this.serialize().equals(other.serialize())
  }
}

/**
 * Serde implementation to convert an encrypted note to its serialized form and back.
 */
export class OutputDescriptionSerde
  implements Serde<OutputDescription, SerializedOutputDescription>
{
  equals(note1: OutputDescription, note2: OutputDescription): boolean {
    return note1.equals(note2)
  }

  serialize(note: OutputDescription): SerializedOutputDescription {
    return note.serialize()
  }

  deserialize(serializedNote: SerializedOutputDescription): OutputDescription {
    return new OutputDescription(serializedNote)
  }
}

/**
 * Serde implementation to convert an encrypted note's hash to its serialized form and back.
 */
export class OutputDescriptionHashSerde
  implements Serde<OutputDescriptionHash, SerializedOutputDescriptionHash>
{
  equals(hash1: OutputDescriptionHash, hash2: OutputDescriptionHash): boolean {
    return hash1.equals(hash2)
  }
  serialize(note: OutputDescriptionHash): SerializedOutputDescriptionHash {
    return note
  }
  deserialize(serializedNote: SerializedOutputDescriptionHash): OutputDescriptionHash {
    return serializedNote
  }
}
