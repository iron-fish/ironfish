/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { IDatabaseEncoding } from '../../storage/database/types'
import bufio, { sizeVarBytes } from 'bufio'
import { NoteEncrypted } from '../../primitives/noteEncrypted'

export interface LeafValue<T> {
  index: number
  element: T
  merkleHash: Buffer
  parentIndex: number
}

export type NoteLeafValue = LeafValue<NoteEncrypted>

export type NullifierLeafValue = LeafValue<Buffer>

export class NoteLeafEncoding implements IDatabaseEncoding<NoteLeafValue> {
  serialize(value: NoteLeafValue): Buffer {
    const bw = bufio.write(this.getSize(value))

    bw.writeU32(value.index)
    bw.writeVarBytes(value.element.serialize())
    bw.writeHash(value.merkleHash)
    bw.writeU32(value.parentIndex)

    return bw.render()
  }

  deserialize(buffer: Buffer): NoteLeafValue {
    const reader = bufio.read(buffer, true)

    const index = reader.readU32()
    const element = new NoteEncrypted(reader.readVarBytes())
    const merkleHash = reader.readHash()
    const parentIndex = reader.readU32()

    return {
      index,
      element,
      merkleHash,
      parentIndex,
    }
  }

  getSize(value: NoteLeafValue): number {
    let size = 0
    size += 4 // index
    // TODO: This is fixed size
    size += sizeVarBytes(value.element.serialize())
    size += 32 // merkleHash
    size += 4 // parentIndex
    return size
  }
}

export class NullifierLeafEncoding implements IDatabaseEncoding<NullifierLeafValue> {
  serialize(value: NullifierLeafValue): Buffer {
    const bw = bufio.write(this.getSize(value))

    bw.writeU32(value.index)
    bw.writeVarBytes(value.element)
    bw.writeHash(value.merkleHash)
    bw.writeU32(value.parentIndex)

    return bw.render()
  }

  deserialize(buffer: Buffer): NullifierLeafValue {
    const reader = bufio.read(buffer, true)

    const index = reader.readU32()
    const element = reader.readVarBytes()
    const merkleHash = reader.readHash()
    const parentIndex = reader.readU32()

    return {
      index,
      element,
      merkleHash,
      parentIndex,
    }
  }

  getSize(value: NullifierLeafValue): number {
    let size = 0
    size += 4 // index
    // TODO: This is fixed size
    size += sizeVarBytes(value.element)
    size += 32 // merkleHash
    size += 4 // parentIndex
    return size
  }
}
