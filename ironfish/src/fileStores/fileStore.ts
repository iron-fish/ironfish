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
  // According to the documentation: "It is unsafe to use filehandle.writeFile() multiple
  // times on the same file without waiting for the promise to be fulfilled (or rejected)."
  // https://nodejs.org/api/fs.html#filehandlewritefiledata-options
  // We have had several complaints especially from Windows users about the json file being corrupted.
  // We call this function several places in our codebase without waiting for the promise to complete.
  // This mutex is used to prevent multiple writes to the same file.
  saveFileMutex = new Mutex()

  constructor(files: FileSystem, configName: string, dataDir: string) {
    this.files = files
    this.dataDir = files.resolve(dataDir)
    this.configName = configName
    this.configPath = path.join(this.dataDir, configName)
  }

  async load(): Promise<PartialRecursive<T> | null> {
    const configExists = await this.files.exists(this.configPath)

    let config = null

    if (configExists) {
      const data = await this.files.readFile(this.configPath)
      config = JSONUtils.parse<PartialRecursive<T>>(data, this.configName)
    }

    return config
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
