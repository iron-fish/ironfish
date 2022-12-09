/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import leveldown from 'leveldown'
import os from 'os'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { IDatabase, LevelupDatabase } from '../../storage'
import { createDB as createDBStorage } from '../../storage/utils'
import { TEST_DATA_DIR } from '../utils'

/** Generate a test database name from the given test if not provided*/
export function makeDbName(): string {
  const id = (Math.random() * Number.MAX_SAFE_INTEGER).toFixed(0)
  const testName = expect.getState().currentTestName || ''
  return testName + '-' + id
}

export function makeDb(name?: string): IDatabase {
  if (!name) {
    name = makeDbName()
  }
  return new LevelupDatabase(leveldown(`${TEST_DATA_DIR}/${name}`))
}

export function makeDbPath(name?: string): string {
  if (!name) {
    name = makeDbName()
  }
  return `${TEST_DATA_DIR}/${name}`
}

export async function createTestDB(
  open = false,
  location?: string,
): Promise<{ db: IDatabase; location: string }> {
  if (!location) {
    location = path.join(os.tmpdir(), uuid())
  }

  const database = createDBStorage({ location })

  afterEach(async () => database?.close())

  if (open) {
    await database.open()
  }

  return {
    db: database,
    location,
  }
}
