/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import fs from 'fs'
import leveldown from 'leveldown'
import levelup, { LevelUp } from 'levelup'
import path from 'path'

function cacheDb(cacheDir: string = path.join(__dirname, 'block-cache')): LevelUp {
  // Create the cache directory if it doesn't exist
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir)
  }

  const dbPath = path.join(cacheDir, 'leveldb')
  return levelup(leveldown(dbPath))
}

async function cacheBlocks(): Promise<void> {
  const db = cacheDb()
  const head = await db.get('head')
  const stream = await rpc.followChainStream(head ? { head } : undefined)

  for await (const content of stream.contentStream()) {
    if (content.block.type === 'connected') {
      await db.put(head, content.block.hash.toString())
      await db.put(
        content.block.sequence.toString(),
        JSON.stringify(compactBlock(content.block)),
      )
    } else if (content.block.type === 'disconnected') {
      // assumes that the new connected block hasn't already overwritten this sequence
      await db.put(head, content.block.previousBlockHash.toString())
      await db.del(content.block.sequence.toString())
    }
  }
}
