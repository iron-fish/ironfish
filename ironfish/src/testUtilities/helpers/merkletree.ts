/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { MerkleTree } from '../../merkletree'
import { StructureHasher } from '../../merkletree/hasher'
import { IDatabase, IDatabaseEncoding, StringEncoding } from '../../storage'
import { createDB } from '../helpers/storage'

type StructureLeafValue = {
  index: number
  element: string
  merkleHash: string
  parentIndex: number
}

class StructureLeafEncoding implements IDatabaseEncoding<StructureLeafValue> {
  serialize(value: StructureLeafValue): Buffer {
    const bw = bufio.write()

    bw.writeU32(value.index)
    bw.writeVarString(value.element)
    bw.writeVarString(value.merkleHash)
    bw.writeU32(value.parentIndex)

    return bw.render()
  }

  deserialize(buffer: Buffer): StructureLeafValue {
    const bw = bufio.read(buffer, true)

    const index = bw.readU32()
    const element = bw.readVarString()
    const merkleHash = bw.readVarString()
    const parentIndex = bw.readU32()

    return {
      index,
      element,
      merkleHash,
      parentIndex,
    }
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
    db: db,
    name: name,
    depth: depth,
  })

  await db.open()
  await tree.upgrade()

  if (leaves) {
    for (const i of leaves) {
      await tree.add(i)
    }
  }

  return tree
}
