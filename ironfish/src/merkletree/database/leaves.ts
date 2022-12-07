/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { IDatabaseEncoding } from '../../storage/database/types'
import bufio from 'bufio'

export interface LeafValue {
  merkleHash: Buffer
  parentIndex: number
}

export class LeafEncoding implements IDatabaseEncoding<LeafValue> {
  serialize(value: LeafValue): Buffer {
    const bw = bufio.write(this.getSize())

    bw.writeHash(value.merkleHash)
    bw.writeU32(value.parentIndex)

    return bw.render()
  }

  deserialize(buffer: Buffer): LeafValue {
    const reader = bufio.read(buffer, true)

    const merkleHash = reader.readHash()
    const parentIndex = reader.readU32()

    return {
      merkleHash,
      parentIndex,
    }
  }

  getSize(): number {
    let size = 0
    size += 32 // merkleHash
    size += 4 // parentIndex
    return size
  }
}
