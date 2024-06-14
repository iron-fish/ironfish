/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DECRYPTED_NOTE_LENGTH, ENCRYPTED_NOTE_LENGTH } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { NoteEncrypted } from '../../primitives/noteEncrypted'
import { ACCOUNT_KEY_LENGTH } from '../../wallet'
import { VIEW_KEY_LENGTH } from '../../wallet/walletdb/accountValue'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export interface DecryptNotesOptions {
  decryptForSpender: boolean
}

export interface DecryptNotesAccountKey {
  incomingViewKey: string
  outgoingViewKey: string
  viewKey: string
}

export interface DecryptNotesItem {
  serializedNote: Buffer
  currentNoteIndex: number | null
}

export interface DecryptedNote {
  index: number | null
  forSpender: boolean
  hash: Buffer
  nullifier: Buffer | null
  serializedNote: Buffer
}

const NO_NOTE_INDEX: number = (1 << 32) - 1

export class DecryptNotesRequest extends WorkerMessage {
  readonly accountKeys: ReadonlyArray<DecryptNotesAccountKey>
  readonly encryptedNotes: ReadonlyArray<DecryptNotesItem>
  readonly options: DecryptNotesOptions

  constructor(
    accountKeys: ReadonlyArray<DecryptNotesAccountKey>,
    encryptedNotes: ReadonlyArray<DecryptNotesItem>,
    options: DecryptNotesOptions,
    jobId?: number,
  ) {
    super(WorkerMessageType.DecryptNotes, jobId)
    this.accountKeys = accountKeys
    this.encryptedNotes = encryptedNotes
    this.options = options
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeU8(this.options.decryptForSpender ? 1 : 0)
    bw.writeU32(this.accountKeys.length)

    for (const key of this.accountKeys) {
      bw.writeBytes(Buffer.from(key.incomingViewKey, 'hex'))
      bw.writeBytes(Buffer.from(key.outgoingViewKey, 'hex'))
      bw.writeBytes(Buffer.from(key.viewKey, 'hex'))
    }

    for (const note of this.encryptedNotes) {
      bw.writeBytes(note.serializedNote)
      bw.writeU32(note.currentNoteIndex ?? NO_NOTE_INDEX)
    }
  }

  static deserializePayload(jobId: number, buffer: Buffer): DecryptNotesRequest {
    const reader = bufio.read(buffer, true)

    const accountKeys = []
    const encryptedNotes = []
    const options = { decryptForSpender: reader.readU8() !== 0 }

    const keysLength = reader.readU32()
    for (let i = 0; i < keysLength; i++) {
      const incomingViewKey = reader.readBytes(ACCOUNT_KEY_LENGTH).toString('hex')
      const outgoingViewKey = reader.readBytes(ACCOUNT_KEY_LENGTH).toString('hex')
      const viewKey = reader.readBytes(VIEW_KEY_LENGTH).toString('hex')
      accountKeys.push({ incomingViewKey, outgoingViewKey, viewKey })
    }

    while (reader.left() > 0) {
      const serializedNote = reader.readBytes(ENCRYPTED_NOTE_LENGTH)
      let currentNoteIndex: number | null = reader.readU32()
      if (currentNoteIndex === NO_NOTE_INDEX) {
        currentNoteIndex = null
      }
      encryptedNotes.push({
        serializedNote,
        currentNoteIndex,
      })
    }

    return new DecryptNotesRequest(accountKeys, encryptedNotes, options, jobId)
  }

  getSize(): number {
    const optionsSize = 1
    const keySize = ACCOUNT_KEY_LENGTH + ACCOUNT_KEY_LENGTH + VIEW_KEY_LENGTH
    const noteSize = ENCRYPTED_NOTE_LENGTH + 4

    return (
      optionsSize +
      4 +
      keySize * this.accountKeys.length +
      noteSize * this.encryptedNotes.length
    )
  }
}

export class DecryptNotesResponse extends WorkerMessage {
  readonly notes: Array<DecryptedNote | null>

  constructor(notes: Array<DecryptedNote | null>, jobId: number) {
    super(WorkerMessageType.DecryptNotes, jobId)
    this.notes = notes
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    // TODO: the majority of responses will have 0 decrypted notes. It make sense to
    // return a more compact serialization in that case.
    for (const note of this.notes) {
      const hasDecryptedNote = Number(!!note)
      bw.writeU8(hasDecryptedNote)

      if (note) {
        let flags = 0
        flags |= Number(!!note.index) << 0
        flags |= Number(!!note.nullifier) << 1
        flags |= Number(note.forSpender) << 2
        bw.writeU8(flags)
        bw.writeHash(note.hash)
        bw.writeBytes(note.serializedNote)

        if (note.index) {
          bw.writeU32(note.index)
        }

        if (note.nullifier) {
          bw.writeHash(note.nullifier)
        }
      }
    }
  }

  static deserializePayload(jobId: number, buffer: Buffer): DecryptNotesResponse {
    const reader = bufio.read(buffer)
    const notes = []

    while (reader.left() > 0) {
      const hasDecryptedNote = reader.readU8()
      if (!hasDecryptedNote) {
        notes.push(null)
        continue
      }

      const flags = reader.readU8()
      const hasIndex = flags & (1 << 0)
      const hasNullifier = flags & (1 << 1)
      const forSpender = Boolean(flags & (1 << 2))
      const hash = reader.readHash()
      const serializedNote = reader.readBytes(DECRYPTED_NOTE_LENGTH)

      let index = null
      if (hasIndex) {
        index = reader.readU32()
      }

      let nullifier = null
      if (hasNullifier) {
        nullifier = reader.readHash()
      }

      notes.push({
        forSpender,
        index,
        hash,
        nullifier,
        serializedNote,
      })
    }

    return new DecryptNotesResponse(notes, jobId)
  }

  getSize(): number {
    let size = 0

    for (const note of this.notes) {
      size += 1

      if (note) {
        size += 1 + 32 + DECRYPTED_NOTE_LENGTH

        if (note.index) {
          size += 4
        }

        if (note.nullifier) {
          size += 32
        }
      }
    }

    return size
  }
}

export class DecryptNotesTask extends WorkerTask {
  private static instance: DecryptNotesTask | undefined

  static getInstance(): DecryptNotesTask {
    if (!DecryptNotesTask.instance) {
      DecryptNotesTask.instance = new DecryptNotesTask()
    }
    return DecryptNotesTask.instance
  }

  execute({
    accountKeys,
    encryptedNotes,
    options,
    jobId,
  }: DecryptNotesRequest): DecryptNotesResponse {
    const decryptedNotes = []

    for (const { serializedNote, currentNoteIndex } of encryptedNotes) {
      const note = new NoteEncrypted(serializedNote)

      for (const { incomingViewKey, outgoingViewKey, viewKey } of accountKeys) {
        // Try decrypting the note as the owner
        const receivedNote = note.decryptNoteForOwner(incomingViewKey)
        if (receivedNote && receivedNote.value() !== 0n) {
          decryptedNotes.push({
            index: currentNoteIndex,
            forSpender: false,
            hash: note.hash(),
            nullifier:
              currentNoteIndex !== null
                ? receivedNote.nullifier(viewKey, BigInt(currentNoteIndex))
                : null,
            serializedNote: receivedNote.serialize(),
          })
          continue
        }

        if (options.decryptForSpender) {
          // Try decrypting the note as the spender
          const spentNote = note.decryptNoteForSpender(outgoingViewKey)
          if (spentNote && spentNote.value() !== 0n) {
            decryptedNotes.push({
              index: currentNoteIndex,
              forSpender: true,
              hash: note.hash(),
              nullifier: null,
              serializedNote: spentNote.serialize(),
            })
            continue
          }
        }

        decryptedNotes.push(null)
      }
    }

    return new DecryptNotesResponse(decryptedNotes, jobId)
  }
}
