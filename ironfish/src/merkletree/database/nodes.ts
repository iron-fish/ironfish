/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { IDatabaseEncoding } from '../../storage/database/types'
import bufio from 'bufio'
import { Side } from '../merkletree'

export type NodeValue<H> = LeftNodeValue<H> | RightNodeValue<H>

type LeftNodeValue<H> = {
  side: Side.Left
  hashOfSibling: H
  parentIndex: number // left nodes have a parent index
}

type RightNodeValue<H> = {
  side: Side.Right
  hashOfSibling: H
  leftIndex: number // right nodes have a left index
}

export class NodeEncoding implements IDatabaseEncoding<NodeValue<Buffer>> {
  serialize(value: NodeValue<Buffer>): Buffer {
    const bw = bufio.write(this.getSize())

    bw.writeHash(value.hashOfSibling)

    if (value.side === Side.Left) {
      bw.writeU8(0)
      bw.writeU32(value.parentIndex)
    } else {
      bw.writeU8(1)
      bw.writeU32(value.leftIndex)
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): NodeValue<Buffer> {
    const reader = bufio.read(buffer, true)

    const hashOfSibling = reader.readHash()

    const sideNumber = reader.readU8()
    const side = sideNumber === 0 ? Side.Left : Side.Right

    const otherIndex = reader.readU32()

    if (side === Side.Left) {
      const leftNode: LeftNodeValue<Buffer> = {
        side,
        hashOfSibling,
        parentIndex: otherIndex,
      }
      return leftNode
    }

    const rightNode: RightNodeValue<Buffer> = {
      side,
      hashOfSibling,
      leftIndex: otherIndex,
    }
    return rightNode
  }

  getSize(): number {
    let size = 0
    size += 1 // side
    size += 32 // merkleHash
    size += 4 // parentIndex
    return size
  }
}
