/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DECRYPTED_NOTE_LENGTH } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { Note } from '../../primitives/note'
import { IDatabaseEncoding } from '../../storage'

export interface DecryptedNoteValue {
  accountId: string
  note: Note
  spent: boolean
  transactionHash: Buffer
  // These fields are populated once the note's transaction is on the main chain
  index: number | null
  nullifier: Buffer | null
}

export class DecryptedNoteValueEncoding implements IDatabaseEncoding<DecryptedNoteValue> {
  serialize(value: DecryptedNoteValue): Buffer {
    const { accountId, nullifier, index, note, spent, transactionHash } = value
    const bw = bufio.write(this.getSize(value))

    let flags = 0
    flags |= Number(!!index) << 0
    flags |= Number(!!nullifier) << 1
    flags |= Number(spent) << 2
    bw.writeU8(flags)

    bw.writeVarString(accountId)
    bw.writeBytes(note.serialize())
    bw.writeHash(transactionHash)

    if (index) {
      bw.writeU32(index)
    }
    if (nullifier) {
      bw.writeHash(nullifier)
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): DecryptedNoteValue {
    const reader = bufio.read(buffer, true)

    const flags = reader.readU8()
    const hasIndex = flags & (1 << 0)
    const hasNullifier = flags & (1 << 1)
    const spent = Boolean(flags & (1 << 2))

    const accountId = reader.readVarString()
    const serializedNote = reader.readBytes(DECRYPTED_NOTE_LENGTH)
    const transactionHash = reader.readHash()

    let index = null
    if (hasIndex) {
      index = reader.readU32()
    }

    let nullifier = null
    if (hasNullifier) {
      nullifier = reader.readHash()
    }

    const note = new Note(serializedNote)

    return { accountId, index, nullifier, note, spent, transactionHash }
  }

  getSize(value: DecryptedNoteValue): number {
    let size = 1
    size += bufio.sizeVarString(value.accountId)
    size += DECRYPTED_NOTE_LENGTH

    // transaction hash
    size += 32

    if (value.index) {
      size += 4
    }

    if (value.nullifier) {
      size += 32
    }

    return size
  }
}
