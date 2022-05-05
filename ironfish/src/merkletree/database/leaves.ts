/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { IDatabaseEncoding } from '../../storage/database/types'
import bufio from 'bufio'
import { NoteEncrypted } from '../../primitives/noteEncrypted'

export interface LeafValue<T> {
  element: T
  merkleHash: Buffer
  parentIndex: number
}

const NOTE_BYTES = 275
const NULLIFIER_BYTES = 32

export type NoteLeafValue = LeafValue<NoteEncrypted>

export type NullifierLeafValue = LeafValue<Buffer>

export class NoteLeafEncoding implements IDatabaseEncoding<NoteLeafValue> {
  serialize(value: NoteLeafValue): Buffer {
    const bw = bufio.write(this.getSize())

    bw.writeBytes(value.element.serialize())
    bw.writeHash(value.merkleHash)
    bw.writeU32(value.parentIndex)

    return bw.render()
  }

  deserialize(buffer: Buffer): NoteLeafValue {
    const reader = bufio.read(buffer, true)

    const element = new NoteEncrypted(reader.readBytes(NOTE_BYTES))
    const merkleHash = reader.readHash()
    const parentIndex = reader.readU32()

    return {
      element,
      merkleHash,
      parentIndex,
    }
  }

  getSize(): number {
    let size = 0
    size += NOTE_BYTES // element
    size += 32 // merkleHash
    size += 4 // parentIndex
    return size
  }
}

export class NullifierLeafEncoding implements IDatabaseEncoding<NullifierLeafValue> {
  serialize(value: NullifierLeafValue): Buffer {
    const bw = bufio.write(this.getSize())

    bw.writeBytes(value.element)
    bw.writeHash(value.merkleHash)
    bw.writeU32(value.parentIndex)

    return bw.render()
  }

  deserialize(buffer: Buffer): NullifierLeafValue {
    const reader = bufio.read(buffer, true)

    const element = reader.readBytes(NULLIFIER_BYTES)
    const merkleHash = reader.readHash()
    const parentIndex = reader.readU32()

    return {
      element,
      merkleHash,
      parentIndex,
    }
  }

  getSize(): number {
    let size = 0
    size += NULLIFIER_BYTES // element
    size += 32 // merkleHash
    size += 4 // parentIndex
    return size
  }
}
