/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  ENCRYPTED_NOTE_PLAINTEXT_LENGTH,
  NOTE_ENCRYPTION_KEY_LENGTH,
  NoteEncrypted as NativeNoteEncrypted,
} from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { Serde } from '../serde'
import { Note } from './note'

export type NoteEncryptedHash = Buffer
export type SerializedNoteEncryptedHash = Buffer
export type SerializedNoteEncrypted = Buffer

const ensureBuffer = (value: Buffer | string): Buffer => {
  if (typeof value === 'string') {
    return Buffer.from(value, 'hex')
  } else {
    return value
  }
}

export class NoteEncrypted {
  private readonly noteEncryptedSerialized: Buffer

  private readonly _noteCommitment: Buffer

  private noteEncrypted: NativeNoteEncrypted | null = null
  private referenceCount = 0
  /**
   * Used to record whether the note has already been previously validated, and
   * thus does not need to be checked anymore after parsing. Used to speed up
   * construction of `NativeNoteEncrypted` in `takeReference`.
   */
  private skipValidation: boolean

  constructor(noteEncryptedSerialized: Buffer, options?: { skipValidation?: boolean }) {
    this.noteEncryptedSerialized = noteEncryptedSerialized
    this.skipValidation = options?.skipValidation ?? false

    const reader = bufio.read(noteEncryptedSerialized, true)

    // value commitment
    reader.seek(32)

    // note commitment
    this._noteCommitment = reader.readBytes(32)

    // ephemeral public key
    reader.seek(32)
    // encrypted note
    reader.seek(ENCRYPTED_NOTE_PLAINTEXT_LENGTH)

    // note encryption keys
    reader.seek(NOTE_ENCRYPTION_KEY_LENGTH)
  }

  static size =
    32 + // value commitment
    32 + // note commitment
    32 + // ephemeral public key
    ENCRYPTED_NOTE_PLAINTEXT_LENGTH +
    NOTE_ENCRYPTION_KEY_LENGTH

  serialize(): Buffer {
    return this.noteEncryptedSerialized
  }

  takeReference(): NativeNoteEncrypted {
    this.referenceCount++
    if (this.noteEncrypted === null) {
      this.noteEncrypted = new NativeNoteEncrypted(
        this.noteEncryptedSerialized,
        this.skipValidation,
      )
      this.skipValidation = true
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

  decryptNoteForOwner(incomingViewKey: Buffer | string): Note | undefined {
    const note = this.takeReference().decryptNoteForOwner(ensureBuffer(incomingViewKey))
    this.returnReference()
    if (note) {
      return new Note(note)
    }
  }

  decryptNoteForOwners(incomingViewKeys: Array<Buffer>): Array<Note | undefined> {
    if (incomingViewKeys.length === 0) {
      return []
    } else if (incomingViewKeys.length === 1) {
      return [this.decryptNoteForOwner(incomingViewKeys[0])]
    }

    const notes = this.takeReference().decryptNoteForOwners(incomingViewKeys)
    this.returnReference()
    return notes.map((note) => (note ? new Note(note) : undefined))
  }

  decryptNoteForSpender(outgoingViewKey: Buffer | string): Note | undefined {
    const note = this.takeReference().decryptNoteForSpender(ensureBuffer(outgoingViewKey))
    this.returnReference()
    if (note) {
      return new Note(note)
    }
  }

  hash(): NoteEncryptedHash {
    return this._noteCommitment
  }

  equals(other: NoteEncrypted): boolean {
    return this.serialize().equals(other.serialize())
  }
}

/**
 * Serde implementation to convert an encrypted note to its serialized form and back.
 */
export class NoteEncryptedSerde implements Serde<NoteEncrypted, SerializedNoteEncrypted> {
  equals(note1: NoteEncrypted, note2: NoteEncrypted): boolean {
    return note1.equals(note2)
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
