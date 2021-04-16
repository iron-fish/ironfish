/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MerkleTree } from '../../../merkletree'
import { StructureHasher } from '../../../merkletree/hasher'
import { IDatabase } from '../../../storage'
import { makeDb, makeDbName } from '../../helpers/storage'

/**
 * Make a tree with the given elements.
 */
export async function makeTree({
  characters,
  depth,
  name,
  database,
}: {
  characters?: string
  depth?: number
  name?: string
  database?: IDatabase
} = {}): Promise<MerkleTree<string, string, string, string>> {
  const openDb = !database

  if (characters && !openDb) {
    throw new Error(
      `Cannot create A test merkletree with characters unless you also want to open the DB`,
    )
  }

  if (!name) name = makeDbName()
  if (!database) database = makeDb(name)

  const tree = await MerkleTree.new(new StructureHasher(), database, name, depth)

  if (openDb) {
    await database.open()
  }

  if (characters) {
    for (const i of characters) {
      await tree.add(i)
    }
  }

  return tree
}

/**
 * Make a tree with 16 elements. Used for testing truncate
 */
export async function makeFullTree(
  name?: string,
): Promise<MerkleTree<string, string, string, string>> {
  return await makeTree({ characters: 'abcdefghijklmnop', name: name })
}
