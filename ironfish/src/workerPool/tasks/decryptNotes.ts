/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DECRYPTED_NOTE_LENGTH, ENCRYPTED_NOTE_LENGTH } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { Assert } from '../../assert'
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
    // The majority of responses will have 0 decrypted notes. A small
    // percentage of responses will have a few decrypted notes. It's
    // practically rare that a response will contain a large number of
    // decrypted notes. For this reason, it makes sense to optimize for the
    // case where the decrypted notes are 0 or close to 0.
    //
    // Here we use a sparse serialization: we write the length of the array at
    // the beginning, and then we serialize only the non-null notes, prefixing
    // them with their position in the array.
    //
    // In the most common case (0 decrypted notes), the total serialization
    // size will be 4 bytes, irrespective of how many items the response has.
    // In the second common case (few decrypted notes), the serialization size
    // may still be smaller, or at least very close to, the size that a dense
    // serialization would provide. In the most rare case (most/all decrypted
    // notes), a sparse serialization has more overhead than a dense
    // serialization, but that's an occurrence so rare and specific that we
    // don't need to optimize for it.

    bw.writeU32(this.notes.length)

    for (const [arrayIndex, note] of this.notes.entries()) {
      if (!note) {
        continue
      }

      bw.writeU32(arrayIndex)

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

    const arrayLength = reader.readU32()
    const notes = Array(arrayLength).fill(null) as Array<DecryptedNote | null>

    while (reader.left() > 0) {
      const arrayIndex = reader.readU32()

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

      notes[arrayIndex] = {
        forSpender,
        index,
        hash,
        nullifier,
        serializedNote,
      }
    }

    return new DecryptNotesResponse(notes, jobId)
  }

  getSize(): number {
    let size = 4

    for (const note of this.notes) {
      if (!note) {
        continue
      }

      size += 4 + 1 + 32 + DECRYPTED_NOTE_LENGTH

      if (note.index) {
        size += 4
      }

      if (note.nullifier) {
        size += 32
      }
    }

    return size
  }

  /**
   * Groups each note in the response by the account it belongs to. The
   * `accounts` passed must be in the same order as the `accountKeys` in the
   * `DecryptNotesRequest` that generated this response.
   */
  mapToAccounts(
    accounts: ReadonlyArray<{ accountId: string }>,
  ): Map<string, Array<DecryptedNote | null>> {
    const decryptedNotesByAccount: Array<
      [accountId: string, notes: Array<DecryptedNote | null>]
    > = accounts.map(({ accountId }) => [accountId, []])

    let noteIndex = 0
    while (noteIndex < this.notes.length) {
      for (const [_, accountNotes] of decryptedNotesByAccount) {
        const nextNote: DecryptedNote | null | undefined = this.notes[noteIndex++]
        Assert.isNotUndefined(nextNote)
        accountNotes.push(nextNote)
      }
    }

    Assert.isEqual(noteIndex, this.notes.length)
    return new Map(decryptedNotesByAccount)
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
