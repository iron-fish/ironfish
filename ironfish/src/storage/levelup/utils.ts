/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type LevelDOWN from 'leveldown'
import { LevelupDatabase } from './database'

export async function makeLevelupDatabaseNode(path: string): Promise<LevelupDatabase> {
  await mkDir(path)

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const leveldown = require('leveldown') as typeof LevelDOWN
  return new LevelupDatabase(leveldown(path))

  async function mkDir(path: string): Promise<void> {
    const fs = await import('fs')

    try {
      await fs.promises.mkdir(path, { recursive: true })
    } catch (e: unknown) {
      if (!(e instanceof Error) || !e.message.includes('EEXIST')) throw e
    }
  }
}
