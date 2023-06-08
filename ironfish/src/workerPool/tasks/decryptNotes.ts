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

export interface DecryptNoteOptions {
  serializedNote: Buffer
  incomingViewKey: string
  outgoingViewKey: string
  viewKey: string
  currentNoteIndex: number | null
  decryptForSpender: boolean
}

export interface DecryptedNote {
  index: number | null
  forSpender: boolean
  hash: Buffer
  nullifier: Buffer | null
  serializedNote: Buffer
}

export class DecryptNotesRequest extends WorkerMessage {
  readonly payloads: Array<DecryptNoteOptions>

  constructor(payloads: Array<DecryptNoteOptions>, jobId?: number) {
    super(WorkerMessageType.DecryptNotes, jobId)
    this.payloads = payloads
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    for (const payload of this.payloads) {
      let flags = 0
      flags |= Number(!!payload.currentNoteIndex) << 0
      flags |= Number(payload.decryptForSpender) << 1
      bw.writeU8(flags)

      bw.writeBytes(payload.serializedNote)
      bw.writeBytes(Buffer.from(payload.incomingViewKey, 'hex'))
      bw.writeBytes(Buffer.from(payload.outgoingViewKey, 'hex'))
      bw.writeBytes(Buffer.from(payload.viewKey, 'hex'))

      if (payload.currentNoteIndex) {
        bw.writeU32(payload.currentNoteIndex)
      }
    }
  }

  static deserializePayload(jobId: number, buffer: Buffer): DecryptNotesRequest {
    const reader = bufio.read(buffer, true)
    const payloads = []

    while (reader.left() > 0) {
      const flags = reader.readU8()
      const hasCurrentNoteIndex = flags & (1 << 0)
      const decryptForSpender = Boolean(flags & (1 << 1))
      const serializedNote = reader.readBytes(ENCRYPTED_NOTE_LENGTH)
      const incomingViewKey = reader.readBytes(ACCOUNT_KEY_LENGTH).toString('hex')
      const outgoingViewKey = reader.readBytes(ACCOUNT_KEY_LENGTH).toString('hex')
      const viewKey = reader.readBytes(VIEW_KEY_LENGTH).toString('hex')
      const currentNoteIndex = hasCurrentNoteIndex ? reader.readU32() : null

      payloads.push({
        serializedNote,
        incomingViewKey,
        outgoingViewKey,
        currentNoteIndex,
        decryptForSpender,
        viewKey,
      })
    }

    return new DecryptNotesRequest(payloads, jobId)
  }

  getSize(): number {
    let size = 0
    for (const payload of this.payloads) {
      size += 1
      size += ENCRYPTED_NOTE_LENGTH
      size += ACCOUNT_KEY_LENGTH
      size += ACCOUNT_KEY_LENGTH
      size += VIEW_KEY_LENGTH
      if (payload.currentNoteIndex) {
        size += 4
      }
    }
    return size
  }
}

export class DecryptNotesResponse extends WorkerMessage {
  readonly notes: Array<DecryptedNote>

  constructor(notes: Array<DecryptedNote>, jobId: number) {
    super(WorkerMessageType.DecryptNotes, jobId)
    this.notes = notes
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    for (const note of this.notes) {
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

  static deserializePayload(jobId: number, buffer: Buffer): DecryptNotesResponse {
    const reader = bufio.read(buffer)
    const notes = []

    while (reader.left() > 0) {
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
      size += 1 + 32 + DECRYPTED_NOTE_LENGTH

      if (note.index) {
        size += 4
      }

      if (note.nullifier) {
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

  execute({ payloads, jobId }: DecryptNotesRequest): DecryptNotesResponse {
    const decryptedNotes = []

    for (const {
      serializedNote,
      incomingViewKey,
      outgoingViewKey,
      viewKey,
      currentNoteIndex,
      decryptForSpender,
    } of payloads) {
      const note = new NoteEncrypted(serializedNote)

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

      if (decryptForSpender) {
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
    }

    return new DecryptNotesResponse(decryptedNotes, jobId)
  }
}
