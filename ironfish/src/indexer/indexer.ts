/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileSystem } from '../fileSystems'
import { IDatabase } from '../storage/database'
import { createDB } from '../storage/utils'

const DATABASE_VERSION = 1

export abstract class Indexer {
  files: FileSystem
  database: IDatabase
  location: string

  constructor({ files, location }: { files: FileSystem; location: string }) {
    this.files = files
    this.location = location
    this.database = createDB({ location })
  }

  async open(options: { upgrade?: boolean } = { upgrade: true }): Promise<void> {
    await this.files.mkdir(this.location, { recursive: true })
    await this.database.open()
    if (options.upgrade) {
      await this.database.upgrade(DATABASE_VERSION)
    }
  }

  async close(): Promise<void> {
    await this.database.close()
  }
}
