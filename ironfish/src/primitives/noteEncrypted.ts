/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  ENCRYPTED_NOTE_LENGTH,
  ENCRYPTED_NOTE_PLAINTEXT_LENGTH,
  NOTE_ENCRYPTION_KEY_LENGTH,
  NoteEncrypted as NativeNoteEncrypted,
  PROOF_LENGTH,
} from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { Serde } from '../serde'
import { Note } from './note'

export const NOTE_ENCRYPTED_SERIALIZED_SIZE_IN_BYTE = PROOF_LENGTH + ENCRYPTED_NOTE_LENGTH

export type NoteEncryptedHash = Buffer
export type SerializedNoteEncryptedHash = Buffer
export type SerializedNoteEncrypted = Buffer

export class NoteEncrypted {
  private readonly noteEncryptedSerialized: Buffer

  private readonly _noteCommitment: Buffer

  private noteEncrypted: NativeNoteEncrypted | null = null
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
    reader.seek(ENCRYPTED_NOTE_PLAINTEXT_LENGTH)

    // note encryption keys
    reader.seek(NOTE_ENCRYPTION_KEY_LENGTH)

    // total serialized size: 192 (proof from transaction)
    // + 32 + 32 + 32 + 104 + 16 + 64 + 16 = 488 bytes
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
