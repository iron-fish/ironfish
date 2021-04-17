/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getRuntime } from '../sdk'
import { IDatabase } from './database'
import { LevelupDatabase } from './levelup'
import type LevelDOWN from 'leveldown'

export function createDB(options: { location: string }): IDatabase {
  const runtime = getRuntime()

  if (runtime === 'node') {
    return createLevelupDB(options.location)
  }

  throw new Error(`No default fileSystem for ${String(runtime)}`)
}

export function createLevelupDB(path: string): LevelupDatabase {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const leveldown = require('leveldown') as typeof LevelDOWN
  return new LevelupDatabase(leveldown(path))
}
