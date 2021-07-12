/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MerkleTree } from '../../merkletree'
import { StructureHasher } from '../../merkletree/hasher'
import { IDatabase } from '../../storage'
import { createDB } from '../helpers/storage'

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
