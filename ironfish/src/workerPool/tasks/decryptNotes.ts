/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { ACCOUNT_KEY_LENGTH } from '../../account'
import { NOTE_LENGTH } from '../../primitives/note'
import { ENCRYPTED_NOTE_LENGTH, NoteEncrypted } from '../../primitives/noteEncrypted'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export interface DecryptNoteOptions {
  serializedNote: Buffer
  incomingViewKey: string
  outgoingViewKey: string
  spendingKey: string
  currentNoteIndex: number | null
}

export interface DecryptedNote {
  index: number | null
  forSpender: boolean
  merkleHash: Buffer
  nullifier: Buffer | null
  serializedNote: Buffer
}

export class DecryptNotesRequest extends WorkerMessage {
  readonly payloads: Array<DecryptNoteOptions>

  constructor(payloads: Array<DecryptNoteOptions>, jobId?: number) {
    super(WorkerMessageType.DecryptNotes, jobId)
    this.payloads = payloads
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())

    bw.writeU8(this.payloads.length)
    for (const payload of this.payloads) {
      const hasCurrentNoteIndex = Number(!!payload.currentNoteIndex)
      bw.writeU8(hasCurrentNoteIndex)

      bw.writeBytes(payload.serializedNote)
      bw.writeBytes(Buffer.from(payload.incomingViewKey, 'hex'))
      bw.writeBytes(Buffer.from(payload.outgoingViewKey, 'hex'))
      bw.writeBytes(Buffer.from(payload.spendingKey, 'hex'))

      if (payload.currentNoteIndex) {
        bw.writeU32(payload.currentNoteIndex)
      }
    }

    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): DecryptNotesRequest {
    const reader = bufio.read(buffer, true)
    const payloads = []

    const length = reader.readU8()
    for (let i = 0; i < length; i++) {
      const hasCurrentNoteIndex = Boolean(reader.readU8())
      const serializedNote = reader.readBytes(ENCRYPTED_NOTE_LENGTH)
      const incomingViewKey = reader.readBytes(ACCOUNT_KEY_LENGTH).toString('hex')
      const outgoingViewKey = reader.readBytes(ACCOUNT_KEY_LENGTH).toString('hex')
      const spendingKey = reader.readBytes(ACCOUNT_KEY_LENGTH).toString('hex')

      let currentNoteIndex = null
      if (hasCurrentNoteIndex) {
        currentNoteIndex = reader.readU32()
      }

      payloads.push({
        serializedNote,
        incomingViewKey,
        outgoingViewKey,
        spendingKey,
        currentNoteIndex,
      })
    }

    return new DecryptNotesRequest(payloads, jobId)
  }

  getSize(): number {
    let size = 1
    for (const payload of this.payloads) {
      size += 1
      size += ENCRYPTED_NOTE_LENGTH
      size += ACCOUNT_KEY_LENGTH
      size += ACCOUNT_KEY_LENGTH
      size += +ACCOUNT_KEY_LENGTH
      if (payload.currentNoteIndex) {
        size += 4
      }
    }
    return size
  }
}

export class DecryptNotesResponse extends WorkerMessage {
  readonly notes: Array<DecryptedNote | null>

  constructor(notes: Array<DecryptedNote | null>, jobId: number) {
    super(WorkerMessageType.DecryptNotes, jobId)
    this.notes = notes
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())

    bw.writeU8(this.notes.length)
    for (const note of this.notes) {
      const hasDecryptedNote = Number(!!note)
      bw.writeU8(hasDecryptedNote)

      if (note) {
        let flags = 0
        flags |= Number(!!note.index) << 0
        flags |= Number(!!note.nullifier) << 1
        flags |= Number(note.forSpender) << 2
        bw.writeU8(flags)
        bw.writeHash(note.merkleHash)
        bw.writeBytes(note.serializedNote)

        if (note.index) {
          bw.writeU32(note.index)
        }

        if (note.nullifier) {
          bw.writeHash(note.nullifier)
        }
      }
    }

    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): DecryptNotesResponse {
    const reader = bufio.read(buffer)
    const notes = []

    const length = reader.readU8()
    for (let i = 0; i < length; i++) {
      const hasDecryptedNote = reader.readU8()
      if (!hasDecryptedNote) {
        notes.push(null)
        continue
      }

      const flags = reader.readU8()
      const hasIndex = flags & (1 << 0)
      const hasNullifier = flags & (1 << 1)
      const forSpender = Boolean(flags & (1 << 2))
      const merkleHash = reader.readHash()
      const serializedNote = reader.readBytes(NOTE_LENGTH)

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
        merkleHash,
        nullifier,
        serializedNote,
      })
    }

    return new DecryptNotesResponse(notes, jobId)
  }

  getSize(): number {
    let size = 1

    for (const note of this.notes) {
      size += 1

      if (note) {
        size += 1 + 32 + NOTE_LENGTH

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

  execute({ payloads, jobId }: DecryptNotesRequest): DecryptNotesResponse {
    const decryptedNotes = []

    for (const {
      serializedNote,
      incomingViewKey,
      outgoingViewKey,
      spendingKey,
      currentNoteIndex,
    } of payloads) {
      const note = new NoteEncrypted(serializedNote)

      // Try decrypting the note as the owner
      const receivedNote = note.decryptNoteForOwner(incomingViewKey)
      if (receivedNote && receivedNote.value() !== BigInt(0)) {
        decryptedNotes.push({
          index: currentNoteIndex,
          forSpender: false,
          merkleHash: note.merkleHash(),
          nullifier:
            currentNoteIndex !== null
              ? receivedNote.nullifier(spendingKey, BigInt(currentNoteIndex))
              : null,
          serializedNote: receivedNote.serialize(),
        })
        continue
      }

      // Try decrypting the note as the spender
      const spentNote = note.decryptNoteForSpender(outgoingViewKey)
      if (spentNote && spentNote.value() !== BigInt(0)) {
        decryptedNotes.push({
          index: currentNoteIndex,
          forSpender: true,
          merkleHash: note.merkleHash(),
          nullifier: null,
          serializedNote: spentNote.serialize(),
        })
        continue
      }

      decryptedNotes.push(null)
    }

    return new DecryptNotesResponse(decryptedNotes, jobId)
  }
}
