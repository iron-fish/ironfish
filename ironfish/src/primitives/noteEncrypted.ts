/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NoteEncrypted as NativeNoteEncrypted } from '@ironfish/rust-nodejs'
import { Serde } from '../serde'
import { Note } from './note'

export type NoteEncryptedHash = Buffer
export type SerializedNoteEncryptedHash = Buffer
export type SerializedNoteEncrypted = Buffer

export class NoteEncrypted {
  private readonly noteEncryptedSerialized: Buffer
  private noteEncrypted: NativeNoteEncrypted | null = null
  private referenceCount = 0

  constructor(noteEncryptedSerialized: Buffer) {
    this.noteEncryptedSerialized = noteEncryptedSerialized
  }

  serialize(): Buffer {
    return this.noteEncryptedSerialized
  }

  takeReference(): NativeNoteEncrypted {
    this.referenceCount++
    if (this.noteEncrypted === null) {
      this.noteEncrypted = new NativeNoteEncrypted(this.noteEncryptedSerialized)
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

  merkleHash(): Buffer {
    const note = this.takeReference().merkleHash()
    this.returnReference()
    return Buffer.from(note)
  }
}

/**
 * Serde implementation to convert an encrypted note to its serialized form and back.
 */
export class NoteEncryptedSerde implements Serde<NoteEncrypted, SerializedNoteEncrypted> {
  equals(note1: NoteEncrypted, note2: NoteEncrypted): boolean {
    return note1.serialize().equals(note2.serialize())
  }

  serialize(note: NoteEncrypted): SerializedNoteEncrypted {
    return note.serialize()
  }

  deserialize(serializedNote: SerializedNoteEncrypted): NoteEncrypted {
    return new NoteEncrypted(serializedNote)
  }
}

/**
 * Serde implementation to convert an encrypted note's hash to its serialized form and back.
 */
export class NoteEncryptedHashSerde
  implements Serde<NoteEncryptedHash, SerializedNoteEncryptedHash>
{
  equals(hash1: NoteEncryptedHash, hash2: NoteEncryptedHash): boolean {
    return hash1.equals(hash2)
  }
  serialize(note: NoteEncryptedHash): SerializedNoteEncryptedHash {
    return note
  }
  deserialize(serializedNote: SerializedNoteEncryptedHash): NoteEncryptedHash {
    return serializedNote
  }
}
