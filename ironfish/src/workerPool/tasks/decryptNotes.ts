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

const NO_NOTE_INDEX: number = (1 << 32) - 1

const ACCOUNT_KEY_SIZE: number = ACCOUNT_KEY_LENGTH + ACCOUNT_KEY_LENGTH + VIEW_KEY_LENGTH

export interface DecryptNotesOptions {
  decryptForSpender: boolean
  skipNoteValidation?: boolean
}

export interface DecryptNotesAccountKey {
  incomingViewKey: Buffer
  outgoingViewKey: Buffer
  viewKey: Buffer
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

export type DecryptNotesAccountKeys =
  | DecryptNotesInlineAccountKeys
  | DecryptNotesSharedAccountKeys
export type ReadonlyDecryptNotesAccountKeys =
  | ReadonlyDecryptNotesInlineAccountKeys
  | DecryptNotesSharedAccountKeys

export type DecryptNotesInlineAccountKeys = Array<DecryptNotesAccountKey>
export type ReadonlyDecryptNotesInlineAccountKeys = ReadonlyArray<DecryptNotesAccountKey>

export class DecryptNotesSharedAccountKeys {
  readonly length: number
  readonly sharedBuffer: SharedArrayBuffer

  constructor(accountKeys: ReadonlyArray<DecryptNotesAccountKey> | SharedArrayBuffer) {
    if (accountKeys instanceof SharedArrayBuffer) {
      this.length = Math.trunc(accountKeys.byteLength / ACCOUNT_KEY_SIZE)
      this.sharedBuffer = accountKeys
    } else {
      this.length = accountKeys.length
      this.sharedBuffer = DecryptNotesSharedAccountKeys.serialize(accountKeys)
    }
  }

  at(index: number): DecryptNotesAccountKey | undefined {
    if (index >= this.length) {
      return undefined
    }

    const incomingViewKeyStart = index * ACCOUNT_KEY_LENGTH
    const outgoingViewKeyStart = this.length * ACCOUNT_KEY_LENGTH + index * ACCOUNT_KEY_LENGTH
    const viewKeyStart = 2 * this.length * ACCOUNT_KEY_LENGTH + index * VIEW_KEY_LENGTH

    return {
      incomingViewKey: Buffer.from(this.sharedBuffer, incomingViewKeyStart, ACCOUNT_KEY_LENGTH),
      outgoingViewKey: Buffer.from(this.sharedBuffer, outgoingViewKeyStart, ACCOUNT_KEY_LENGTH),
      viewKey: Buffer.from(this.sharedBuffer, viewKeyStart, VIEW_KEY_LENGTH),
    }
  }

  map<T>(fn: (key: DecryptNotesAccountKey) => T): Array<T> {
    const result = new Array<T>()
    for (let index = 0; index < this.length; index++) {
      const key = this.at(index)
      Assert.isNotUndefined(key)
      result.push(fn(key))
    }
    return result
  }

  private static serialize(
    accountKeys: ReadonlyArray<DecryptNotesAccountKey>,
  ): SharedArrayBuffer {
    const size = ACCOUNT_KEY_SIZE * accountKeys.length

    const buffer = new SharedArrayBuffer(size)
    const array = new Uint8Array(buffer)
    let offset = 0

    const write = (bytes: Buffer) => {
      array.set(bytes, offset)
      offset += bytes.length
    }

    for (const key of accountKeys) {
      write(key.incomingViewKey)
    }
    for (const key of accountKeys) {
      write(key.outgoingViewKey)
    }
    for (const key of accountKeys) {
      write(key.viewKey)
    }

    return buffer
  }
}

export class DecryptNotesRequest extends WorkerMessage {
  readonly accountKeys: ReadonlyDecryptNotesAccountKeys
  readonly encryptedNotes: ReadonlyArray<DecryptNotesItem>
  readonly options: DecryptNotesOptions

  constructor(
    accountKeys: ReadonlyDecryptNotesAccountKeys,
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
    const flags =
      (Number(this.options.decryptForSpender) << 0) |
      (Number(this.options.skipNoteValidation ?? false) << 1) |
      (Number(this.accountKeys instanceof DecryptNotesSharedAccountKeys) << 2)
    bw.writeU8(flags)

    if (!(this.accountKeys instanceof DecryptNotesSharedAccountKeys)) {
      bw.writeU32(this.accountKeys.length)
      for (const key of this.accountKeys) {
        bw.writeBytes(key.incomingViewKey)
        bw.writeBytes(key.outgoingViewKey)
        bw.writeBytes(key.viewKey)
      }
    }

    for (const note of this.encryptedNotes) {
      bw.writeBytes(note.serializedNote)
      bw.writeU32(note.currentNoteIndex ?? NO_NOTE_INDEX)
    }
  }

  getSharedMemoryPayload(): SharedArrayBuffer | null {
    if (this.accountKeys instanceof DecryptNotesSharedAccountKeys) {
      return this.accountKeys.sharedBuffer
    } else {
      return null
    }
  }

  static deserializePayload(
    jobId: number,
    buffer: Buffer,
    sharedAccountKeys: SharedArrayBuffer | null,
  ): DecryptNotesRequest {
    const reader = bufio.read(buffer, true)

    const flags = reader.readU8()
    const options = {
      decryptForSpender: !!(flags & (1 << 0)),
      skipNoteValidation: !!(flags & (1 << 1)),
    }
    const hasSharedAccountKeys = flags & (1 << 2)

    let accountKeys: DecryptNotesAccountKeys
    if (hasSharedAccountKeys) {
      Assert.isNotNull(
        sharedAccountKeys,
        'expected account keys to be provided as a SharedArrayBuffer',
      )
      accountKeys = new DecryptNotesSharedAccountKeys(sharedAccountKeys)
    } else {
      Assert.isNull(
        sharedAccountKeys,
        'account keys are already inline in the message, they should not be provided as a SharedArrayBuffer',
      )
      const keysLength = reader.readU32()
      accountKeys = new Array<DecryptNotesAccountKey>()
      for (let i = 0; i < keysLength; i++) {
        const incomingViewKey = reader.readBytes(ACCOUNT_KEY_LENGTH)
        const outgoingViewKey = reader.readBytes(ACCOUNT_KEY_LENGTH)
        const viewKey = reader.readBytes(VIEW_KEY_LENGTH)
        accountKeys.push({ incomingViewKey, outgoingViewKey, viewKey })
      }
    }

    const encryptedNotes = []
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
    const noteSize = ENCRYPTED_NOTE_LENGTH + 4
    let accountKeysSize = 0

    if (!(this.accountKeys instanceof DecryptNotesSharedAccountKeys)) {
      accountKeysSize += 4 + ACCOUNT_KEY_SIZE * this.accountKeys.length
    }

    return optionsSize + accountKeysSize + noteSize * this.encryptedNotes.length
  }
}

export class DecryptNotesResponse extends WorkerMessage {
  readonly notes: Array<DecryptedNote | undefined>

  constructor(notes: Array<DecryptedNote | undefined>, jobId: number) {
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

    // `this.notes` may be a sparse array. Using `forEach()` will skip the
    // unset slots (as opposed to using `for (... of this.notes)`, which will
    // iterate over the unset slots).
    this.notes.forEach((note, notesArrayIndex) => {
      if (!note) {
        return
      }

      bw.writeU32(notesArrayIndex)

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
    })
  }

  static deserializePayload(jobId: number, buffer: Buffer): DecryptNotesResponse {
    const reader = bufio.read(buffer)

    const notes = new Array<DecryptedNote | undefined>()
    notes.length = reader.readU32()

    while (reader.left() > 0) {
      const notesArrayIndex = reader.readU32()

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

      notes[notesArrayIndex] = {
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
    // `this.notes` may be a sparse array. `reduce()` won't visit the unset
    // slots in that case.
    return this.notes.reduce((size, note) => {
      if (!note) {
        return size
      }

      size += 4 + 1 + 32 + DECRYPTED_NOTE_LENGTH

      if (note.index) {
        size += 4
      }

      if (note.nullifier) {
        size += 32
      }

      return size
    }, 4)
  }

  /**
   * Groups each note in the response by the account it belongs to. The
   * `accounts` passed must be in the same order as the `accountKeys` in the
   * `DecryptNotesRequest` that generated this response.
   */
  mapToAccounts(
    accounts: ReadonlyArray<{ accountId: string }>,
  ): Map<string, Array<DecryptedNote | undefined>> {
    if (
      !(this.notes.length === 0 && accounts.length === 0) &&
      this.notes.length % accounts.length !== 0
    ) {
      throw new Error(
        `${this.notes.length} notes cannot be mapped to ${accounts.length} accounts`,
      )
    }

    const notesPerAccount = Math.trunc(this.notes.length / accounts.length)

    const decryptedNotesByAccount: Array<
      [accountId: string, notes: Array<DecryptedNote | undefined>]
    > = accounts.map(({ accountId }) => {
      const accountNotes: Array<DecryptedNote | undefined> = []
      accountNotes.length = notesPerAccount
      return [accountId, accountNotes]
    })

    this.notes.forEach((note, notesArrayIndex) => {
      const accountIndex = notesArrayIndex % accounts.length
      const accountNotesArrayIndex = Math.trunc(notesArrayIndex / accounts.length)
      const [_accountId, accountNotes] = decryptedNotesByAccount[accountIndex]
      accountNotes[accountNotesArrayIndex] = note
    })

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
    const incomingViewKeys = accountKeys.map(({ incomingViewKey }) => incomingViewKey)
    const noteOptions = {
      skipValidation: options.skipNoteValidation,
    }

    decryptedNotes.length = incomingViewKeys.length * encryptedNotes.length

    let decryptedNoteIndex = 0
    for (const { serializedNote, currentNoteIndex } of encryptedNotes) {
      const note = new NoteEncrypted(serializedNote, noteOptions)
      const receivedNotes = note.decryptNoteForOwners(incomingViewKeys)

      for (const [accountIndex, receivedNote] of receivedNotes.entries()) {
        // Try decrypting the note as the owner
        if (receivedNote && receivedNote.value() !== 0n) {
          const key = accountKeys.at(accountIndex)
          Assert.isNotUndefined(key)
          decryptedNotes[decryptedNoteIndex++] = {
            index: currentNoteIndex,
            forSpender: false,
            hash: note.hash(),
            nullifier:
              currentNoteIndex !== null
                ? receivedNote.nullifier(key.viewKey.toString('hex'), BigInt(currentNoteIndex))
                : null,
            serializedNote: receivedNote.serialize(),
          }
          continue
        }

        if (options.decryptForSpender) {
          // Try decrypting the note as the spender
          const key = accountKeys.at(accountIndex)
          Assert.isNotUndefined(key)
          const spentNote = note.decryptNoteForSpender(key.outgoingViewKey)
          if (spentNote && spentNote.value() !== 0n) {
            decryptedNotes[decryptedNoteIndex++] = {
              index: currentNoteIndex,
              forSpender: true,
              hash: note.hash(),
              nullifier: null,
              serializedNote: spentNote.serialize(),
            }
            continue
          }
        }

        decryptedNoteIndex++
      }
    }

    return new DecryptNotesResponse(decryptedNotes, jobId)
  }
}
