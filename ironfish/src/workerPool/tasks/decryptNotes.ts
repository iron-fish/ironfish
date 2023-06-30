/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  DECRYPTED_NOTE_LENGTH,
  ENCRYPTED_NOTE_LENGTH,
  NativeIncomingViewKey,
  NativeOutgoingViewKey,
  NativeViewKey,
} from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { NoteEncrypted } from '../../primitives/noteEncrypted'
import { ACCOUNT_KEY_LENGTH } from '../../wallet'
import { VIEW_KEY_LENGTH } from '../../wallet/walletdb/accountValue'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export interface DecryptNoteOptions {
  incomingViewKey: string
  outgoingViewKey: string
  viewKey: string
  decryptForSpender: boolean
  notes: Array<{
    serializedNote: Buffer
    currentNoteIndex: number | null
  }>
}

export interface DecryptedNote {
  index: number | null
  forSpender: boolean
  hash: Buffer
  nullifier: Buffer | null
  serializedNote: Buffer
}

export class DecryptNotesRequest extends WorkerMessage {
  readonly payload: DecryptNoteOptions

  constructor(payload: DecryptNoteOptions, jobId?: number) {
    super(WorkerMessageType.DecryptNotes, jobId)
    this.payload = payload
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeBytes(Buffer.from(this.payload.incomingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(this.payload.outgoingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(this.payload.viewKey, 'hex'))
    bw.writeU8(Number(this.payload.decryptForSpender))

    for (const note of this.payload.notes) {
      bw.writeBytes(note.serializedNote)

      if (note.currentNoteIndex) {
        bw.writeU8(Number(true))
        bw.writeU32(note.currentNoteIndex)
      } else {
        bw.writeU8(Number(false))
      }
    }
  }

  static deserializePayload(jobId: number, buffer: Buffer): DecryptNotesRequest {
    const reader = bufio.read(buffer, true)

    const incomingViewKey = reader.readBytes(ACCOUNT_KEY_LENGTH).toString('hex')
    const outgoingViewKey = reader.readBytes(ACCOUNT_KEY_LENGTH).toString('hex')
    const viewKey = reader.readBytes(VIEW_KEY_LENGTH).toString('hex')
    const decryptForSpender = Boolean(reader.readU8())

    const notes = []

    while (reader.left() > 0) {
      const serializedNote = reader.readBytes(ENCRYPTED_NOTE_LENGTH)
      const hasCurrentNoteIndex = Boolean(reader.readU8())
      const currentNoteIndex = hasCurrentNoteIndex ? reader.readU32() : null

      notes.push({
        serializedNote,
        currentNoteIndex,
      })
    }

    const payload = {
      incomingViewKey,
      outgoingViewKey,
      viewKey,
      decryptForSpender,
      notes,
    }

    return new DecryptNotesRequest(payload, jobId)
  }

  getSize(): number {
    let size = 0
    size += ACCOUNT_KEY_LENGTH // incoming view key
    size += ACCOUNT_KEY_LENGTH // outgoing view key
    size += VIEW_KEY_LENGTH
    size += 1 // decrypt for spender
    for (const note of this.payload.notes) {
      size += ENCRYPTED_NOTE_LENGTH
      size += 1 // has current note index
      if (note.currentNoteIndex) {
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

  execute({ payload, jobId }: DecryptNotesRequest): DecryptNotesResponse {
    const incomingViewKeyHex = payload.incomingViewKey
    const outgoingViewKeyHex = payload.outgoingViewKey
    const viewKeyHex = payload.viewKey
    const decryptForSpender = payload.decryptForSpender

    const incomingViewKey = new NativeIncomingViewKey(incomingViewKeyHex)

    let viewKey: NativeViewKey | null = null
    const getViewKey = () => {
      if (viewKey == null) {
        viewKey = new NativeViewKey(viewKeyHex)
      }
      return viewKey
    }

    let outgoingViewKey: NativeOutgoingViewKey | null = null
    const getOutgoingViewKey = () => {
      if (outgoingViewKey == null) {
        outgoingViewKey = new NativeOutgoingViewKey(outgoingViewKeyHex)
      }

      return outgoingViewKey
    }

    const decryptedNotes = []

    for (const { serializedNote, currentNoteIndex } of payload.notes) {
      const note = new NoteEncrypted(serializedNote)

      // Try decrypting the note as the owner
      const receivedNote = note.decryptNoteForOwnerKey(incomingViewKey)
      if (receivedNote && receivedNote.value() !== 0n) {
        decryptedNotes.push({
          index: currentNoteIndex,
          forSpender: false,
          hash: note.hash(),
          nullifier:
            currentNoteIndex !== null
              ? receivedNote.nullifierWithKey(getViewKey(), BigInt(currentNoteIndex))
              : null,
          serializedNote: receivedNote.serialize(),
        })
        continue
      }

      if (decryptForSpender) {
        // Try decrypting the note as the spender
        const spentNote = note.decryptNoteForSpenderKey(getOutgoingViewKey())
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
