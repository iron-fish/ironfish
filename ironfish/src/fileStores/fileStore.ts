/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import path from 'path'
import { FileSystem } from '../fileSystems'
import { Mutex } from '../mutex'
import { JSONUtils, PartialRecursive } from '../utils'

export class FileStore<T extends Record<string, unknown>> {
  files: FileSystem
  dataDir: string
  configPath: string
  configName: string
  saveFileMutex = new Mutex()

  constructor(files: FileSystem, configName: string, dataDir: string) {
    this.files = files
    this.dataDir = files.resolve(dataDir)
    this.configName = configName
    this.configPath = path.join(this.dataDir, configName)
  }

  async load(): Promise<PartialRecursive<T> | null> {
    const exists = await this.files.exists(this.configPath)

    if (!exists) {
      return null
    }

    const data = await this.files.readFile(this.configPath)

    if (data.length === 0) {
      return null
    }

    return JSONUtils.parse<PartialRecursive<T>>(data, this.configName)
  }

  async save(data: PartialRecursive<T>): Promise<void> {
    const json = JSON.stringify(data, undefined, '    ')
    const unlock = await this.saveFileMutex.lock()
    try {
      await this.files.mkdir(path.dirname(this.configPath), { recursive: true })
      await this.files.writeFile(this.configPath, json)
    } finally {
      unlock()
    }
  }
}
