/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../storage'

export interface DecryptableNotesValue {
  accountId: string
  noteIndex: number | null
  nullifierHash: string | null
  spent: boolean
  transactionHash: Buffer | null
}

export class DecryptableNotesValueEncoding implements IDatabaseEncoding<DecryptableNotesValue> {
  serialize(value: DecryptableNotesValue): Buffer {
    const { accountId, nullifierHash, noteIndex, spent, transactionHash } = value
    const bw = bufio.write(this.getSize(value))

    let flags = 0
    flags |= Number(!!noteIndex) << 0
    flags |= Number(!!nullifierHash) << 1
    flags |= Number(!!transactionHash) << 2
    flags |= Number(spent) << 3
    bw.writeU8(flags)

    bw.writeVarString(accountId)
    if (noteIndex) {
      bw.writeU32(noteIndex)
    }
    if (nullifierHash) {
      bw.writeHash(nullifierHash)
    }
    if (transactionHash) {
      bw.writeHash(transactionHash)
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): DecryptableNotesValue {
    const reader = bufio.read(buffer, true)

    const flags = reader.readU8()
    const hasNoteIndex = flags & (1 << 0)
    const hasNullifierHash = flags & (1 << 1)
    const hasTransactionHash = flags & (1 << 2)
    const spent = Boolean(flags & (1 << 3))

    const accountId = reader.readVarString()

    let noteIndex = null
    if (hasNoteIndex) {
      noteIndex = reader.readU32()
    }

    let nullifierHash = null
    if (hasNullifierHash) {
      nullifierHash = reader.readHash('hex')
    }

    let transactionHash = null
    if (hasTransactionHash) {
      transactionHash = reader.readHash()
    }

    return { accountId, noteIndex, nullifierHash, spent, transactionHash }
  }

  getSize(value: DecryptableNotesValue): number {
    let size = 1 + bufio.sizeVarString(value.accountId)
    if (value.noteIndex) {
      size += 4
    }
    if (value.nullifierHash) {
      size += 32
    }
    if (value.transactionHash) {
      size += 32
    }
    return size
  }
}
