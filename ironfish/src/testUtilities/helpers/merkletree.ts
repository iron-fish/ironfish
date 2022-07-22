/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { MerkleTree } from '../../merkletree'
import { NodeValue } from '../../merkletree/database/nodes'
import { StructureHasher } from '../../merkletree/hasher'
import { Side } from '../../merkletree/merkletree'
import { IDatabase, IDatabaseEncoding, StringEncoding } from '../../storage'
import { createDB } from '../helpers/storage'

type StructureLeafValue = {
  element: string
  merkleHash: string
  parentIndex: number
}

class StructureLeafEncoding implements IDatabaseEncoding<StructureLeafValue> {
  serialize(value: StructureLeafValue): Buffer {
    const bw = bufio.write()

    bw.writeVarString(value.element)
    bw.writeVarString(value.merkleHash)
    bw.writeU32(value.parentIndex)

    return bw.render()
  }

  deserialize(buffer: Buffer): StructureLeafValue {
    const bw = bufio.read(buffer, true)

    const element = bw.readVarString()
    const merkleHash = bw.readVarString()
    const parentIndex = bw.readU32()

    return {
      element,
      merkleHash,
      parentIndex,
    }
  }
}

class StructureNodeEncoding implements IDatabaseEncoding<NodeValue<string>> {
  serialize(value: NodeValue<string>): Buffer {
    const bw = bufio.write()

    bw.writeVarString(value.hashOfSibling)

    if (value.side === Side.Left) {
      bw.writeU8(0)
      bw.writeU32(value.parentIndex)
    } else {
      bw.writeU8(1)
      bw.writeU32(value.leftIndex)
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): NodeValue<string> {
    const reader = bufio.read(buffer, true)

    const hashOfSibling = reader.readVarString()

    const sideNumber = reader.readU8()
    const side = sideNumber === 0 ? Side.Left : Side.Right

    const otherIndex = reader.readU32()

    if (side === Side.Left) {
      const leftNode = {
        side,
        hashOfSibling,
        parentIndex: otherIndex,
      } as const
      return leftNode
    }

    const rightNode = {
      side,
      hashOfSibling,
      leftIndex: otherIndex,
    } as const
    return rightNode
  }
}

export async function makeTree({
  name,
  db,
  depth,
  leaves,
}: {
  name?: string
  db?: IDatabase
  depth?: number
  leaves?: string
} = {}): Promise<MerkleTree<string, string, string, string>> {
  if (!db) {
    db = await createDB()
  }

  const tree = new MerkleTree({
    hasher: new StructureHasher(),
    leafIndexKeyEncoding: new StringEncoding(),
    leafEncoding: new StructureLeafEncoding(),
    nodeEncoding: new StructureNodeEncoding(),
    db: db,
    name: name,
    depth: depth,
  })

  await db.open()

  if (leaves) {
    for (const i of leaves) {
      await tree.add(i)
    }
  }

  return tree
}
