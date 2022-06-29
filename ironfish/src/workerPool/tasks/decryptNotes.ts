/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { KEY_LENGTH, NOTE_LENGTH } from '../../common/constants'
import { NoteEncrypted } from '../../primitives/noteEncrypted'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export interface DecryptedNote {
  index: number | null
  forSpender: boolean
  merkleHash: Buffer
  nullifier: Buffer | null
  serializedNote: Buffer
}

export class DecryptNotesRequest extends WorkerMessage {
  readonly serializedNote: Buffer
  readonly incomingViewKey: string
  readonly outgoingViewKey: string
  readonly spendingKey: string
  readonly currentNoteIndex: number | null

  constructor(
    serializedNote: Buffer,
    incomingViewKey: string,
    outgoingViewKey: string,
    spendingKey: string,
    currentNoteIndex: number | null,
    jobId?: number,
  ) {
    super(WorkerMessageType.DecryptNotes, jobId)
    this.serializedNote = serializedNote
    this.incomingViewKey = incomingViewKey
    this.outgoingViewKey = outgoingViewKey
    this.spendingKey = spendingKey
    this.currentNoteIndex = currentNoteIndex
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())

    const hasCurrentNoteIndex = Number(!!this.currentNoteIndex)
    bw.writeU8(hasCurrentNoteIndex)

    bw.writeBytes(this.serializedNote)
    bw.writeBytes(Buffer.from(this.incomingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(this.outgoingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(this.spendingKey, 'hex'))

    if (this.currentNoteIndex) {
      bw.writeU32(this.currentNoteIndex)
    }

    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): DecryptNotesRequest {
    const reader = bufio.read(buffer, true)

    const hasCurrentNoteIndex = Boolean(reader.readU8())
    const serializedNote = reader.readBytes(NOTE_LENGTH)
    const incomingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const outgoingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const spendingKey = reader.readBytes(KEY_LENGTH).toString('hex')

    let currentNoteIndex = null
    if (hasCurrentNoteIndex) {
      currentNoteIndex = reader.readU32()
    }

    return new DecryptNotesRequest(
      serializedNote,
      incomingViewKey,
      outgoingViewKey,
      spendingKey,
      currentNoteIndex,
      jobId,
    )
  }

  getSize(): number {
    let size = 1 + NOTE_LENGTH + KEY_LENGTH + KEY_LENGTH + KEY_LENGTH
    if (this.currentNoteIndex) {
      size += 4
    }
    return size
  }
}

export class DecryptNotesResponse extends WorkerMessage {
  readonly note: DecryptedNote | null

  constructor(note: DecryptedNote | null, jobId: number) {
    super(WorkerMessageType.DecryptNotes, jobId)
    this.note = note
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())

    const hasDecryptedNote = Number(!!this.note)
    bw.writeU8(hasDecryptedNote)

    if (this.note) {
      let flags = 0
      flags |= Number(!!this.note.index) << 0
      flags |= Number(!!this.note.nullifier) << 1
      flags |= Number(this.note.forSpender)
      bw.writeU8(flags)
      bw.writeHash(this.note.merkleHash)
      bw.writeBytes(this.note.serializedNote)

      if (this.note.index) {
        bw.writeU32(this.note.index)
      }

      if (this.note.nullifier) {
        bw.writeHash(this.note.nullifier)
      }
    }

    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): DecryptNotesResponse {
    const reader = bufio.read(buffer)

    const hasDecryptedNote = reader.readU8()
    if (!hasDecryptedNote) {
      return new DecryptNotesResponse(null, jobId)
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

    return new DecryptNotesResponse(
      {
        forSpender,
        index,
        merkleHash,
        nullifier,
        serializedNote,
      },
      jobId,
    )
  }

  getSize(): number {
    let size = 1

    if (this.note) {
      size += 1 + 32 + NOTE_LENGTH

      if (this.note.index) {
        size += 4
      }

      if (this.note.nullifier) {
        size += 32
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
    serializedNote,
    incomingViewKey,
    outgoingViewKey,
    spendingKey,
    currentNoteIndex,
    jobId,
  }: DecryptNotesRequest): DecryptNotesResponse {
    const note = new NoteEncrypted(serializedNote)

    // Try decrypting the note as the owner
    const receivedNote = note.decryptNoteForOwner(incomingViewKey)
    if (receivedNote) {
      if (receivedNote.value() !== BigInt(0)) {
        return new DecryptNotesResponse(
          {
            index: currentNoteIndex,
            forSpender: false,
            merkleHash: note.merkleHash(),
            nullifier:
              currentNoteIndex !== null
                ? receivedNote.nullifier(spendingKey, BigInt(currentNoteIndex))
                : null,
            serializedNote: receivedNote.serialize(),
          },
          jobId,
        )
      }
    }

    // Try decrypting the note as the spender
    const spentNote = note.decryptNoteForSpender(outgoingViewKey)
    if (spentNote) {
      if (spentNote.value() !== BigInt(0)) {
        return new DecryptNotesResponse(
          {
            index: currentNoteIndex,
            forSpender: true,
            merkleHash: note.merkleHash(),
            nullifier: null,
            serializedNote: spentNote.serialize(),
          },
          jobId,
        )
      }
    }

    return new DecryptNotesResponse(null, jobId)
  }
}
