/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { IDatabaseEncoding, IDatabaseStore } from '../../../../storage'

export const NOTE_SIZE = 43 + 8 + 32 + 32

export type DecryptedNotesStore = IDatabaseStore<{
  key: string
  value: DecryptedNotesValue
}>

export interface DecryptedNotesValue {
  accountId: string
  noteIndex: number | null
  nullifierHash: string | null
  serializedNote: Buffer
  spent: boolean
  transactionHash: Buffer
}

export class DecryptedNotesValueEncoding implements IDatabaseEncoding<DecryptedNotesValue> {
  serialize(value: DecryptedNotesValue): Buffer {
    const { accountId, nullifierHash, noteIndex, serializedNote, spent, transactionHash } =
      value

    const bw = bufio.write(this.getSize(value))

    let flags = 0
    flags |= Number(!!noteIndex) << 0
    flags |= Number(!!nullifierHash) << 1
    flags |= Number(spent) << 2
    bw.writeU8(flags)

    bw.writeVarString(accountId)
    bw.writeBytes(serializedNote)
    bw.writeHash(transactionHash)

    if (noteIndex) {
      bw.writeU32(noteIndex)
    }
    if (nullifierHash) {
      bw.writeHash(nullifierHash)
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): DecryptedNotesValue {
    const reader = bufio.read(buffer, true)

    const flags = reader.readU8()
    const hasNoteIndex = flags & (1 << 0)
    const hasNullifierHash = flags & (1 << 1)
    const spent = Boolean(flags & (1 << 2))

    const accountId = reader.readVarString()
    const serializedNote = reader.readBytes(NOTE_SIZE)
    const transactionHash = reader.readHash()

    let noteIndex = null
    if (hasNoteIndex) {
      noteIndex = reader.readU32()
    }

    let nullifierHash = null
    if (hasNullifierHash) {
      nullifierHash = reader.readHash('hex')
    }

    return { accountId, noteIndex, nullifierHash, serializedNote, spent, transactionHash }
  }

  getSize(value: DecryptedNotesValue): number {
    let size = 1

    size += bufio.sizeVarString(value.accountId)

    size += NOTE_SIZE

    // transaction hash
    size += 32

    if (value.noteIndex) {
      size += 4
    }

    if (value.nullifierHash) {
      size += 32
    }

    return size
  }
}
