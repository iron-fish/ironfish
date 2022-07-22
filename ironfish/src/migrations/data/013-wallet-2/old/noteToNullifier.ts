/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../../storage'

export type NoteToNullifierStore = IDatabaseStore<{
  key: string
  value: NoteToNullifiersValue
}>

export interface NoteToNullifiersValue {
  nullifierHash: string | null
  noteIndex: number | null
  spent: boolean
}

export class NoteToNullifiersValueEncoding implements IDatabaseEncoding<NoteToNullifiersValue> {
  serialize(value: NoteToNullifiersValue): Buffer {
    const { nullifierHash, noteIndex, spent } = value
    const bw = bufio.write(this.getSize(value))

    let flags = 0
    flags |= Number(!!nullifierHash) << 0
    flags |= Number(!!noteIndex) << 1
    flags |= Number(spent) << 2
    bw.writeU8(flags)

    if (nullifierHash) {
      bw.writeHash(nullifierHash)
    }
    if (noteIndex) {
      bw.writeU32(noteIndex)
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): NoteToNullifiersValue {
    const reader = bufio.read(buffer, true)

    const flags = reader.readU8()
    const hasNullifierHash = flags & (1 << 0)
    const hasNoteIndex = flags & (1 << 1)
    const spent = Boolean(flags & (1 << 2))

    let nullifierHash = null
    if (hasNullifierHash) {
      nullifierHash = reader.readHash('hex')
    }

    let noteIndex = null
    if (hasNoteIndex) {
      noteIndex = reader.readU32()
    }

    return { nullifierHash, noteIndex, spent }
  }

  getSize(value: NoteToNullifiersValue): number {
    let size = 1
    if (value.nullifierHash) {
      size += 32
    }
    if (value.noteIndex) {
      size += 4
    }
    return size
  }
}
