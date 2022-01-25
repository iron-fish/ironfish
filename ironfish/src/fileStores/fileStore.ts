/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import path from 'path'
import { FileSystem } from '../fileSystems'
import { JSONUtils, PartialRecursive } from '../utils'

export const DEFAULT_DATA_DIR = '~/.ironfish'

export class FileStore<T extends Record<string, unknown>> {
  files: FileSystem
  dataDir: string
  configPath: string
  configName: string

  constructor(files: FileSystem, configName: string, dataDir?: string) {
    this.files = files
    this.dataDir = files.resolve(dataDir || DEFAULT_DATA_DIR)
    this.configName = configName
    this.configPath = path.join(this.dataDir, configName)
  }

  async load(): Promise<PartialRecursive<T> | null> {
    const configExists = await this.files
      .access(this.configPath)
      .then(() => true)
      .catch(() => false)

    let config = null

    if (configExists) {
      const data = await this.files.readFile(this.configPath)
      config = JSONUtils.parse<PartialRecursive<T>>(data, this.configName)
    }

    return config
  }

  async save(data: PartialRecursive<T>): Promise<void> {
    const json = JSON.stringify(data, undefined, '    ')
    await this.files.mkdir(this.dataDir, { recursive: true })
    await this.files.writeFile(this.configPath, json)
  }
}
