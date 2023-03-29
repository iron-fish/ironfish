/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import fs from 'fs'
import fsSync from 'fs/promises'
import os from 'os'
import path from 'path'
import { FileSystem } from './fileSystem'

export class NodeFileProvider extends FileSystem {
  async access(path: fs.PathLike, mode?: number | undefined): Promise<void> {
    await fsSync.access(path, mode)
  }

  async writeFile(
    path: string,
    data: string,
    options?: { mode?: fs.Mode; flag?: fs.OpenMode },
  ): Promise<void> {
    await fsSync.writeFile(path, data, options)
  }

  async readFile(path: string): Promise<string> {
    return await fsSync.readFile(path, { encoding: 'utf8' })
  }

  async mkdir(path: string, options: { recursive?: boolean }): Promise<void> {
    await fsSync.mkdir(path, options)
  }

  resolve(_path: string): string {
    return path.resolve(this.expandTilde(_path))
  }

  join(...paths: string[]): string {
    return path.join(...paths)
  }

  dirname(_path: string): string {
    return path.dirname(_path)
  }

  basename(_path: string, ext?: string | undefined): string {
    return path.basename(_path, ext)
  }

  extname(_path: string): string {
    return path.extname(_path)
  }

  async exists(_path: string): Promise<boolean> {
    return await this.access(_path)
      .then(() => true)
      .catch(() => false)
  }

  /**
   * Expands a path out using known unix shell shortcuts
   * ~ expands to your home directory
   * ~+ expands to your current directory
   *
   * @param filePath The filepath to expand out using unix shortcuts
   */
  private expandTilde(filePath: string): string {
    const CHAR_TILDE = 126
    const CHAR_PLUS = 43
    const home = os.homedir()

    if (filePath.charCodeAt(0) === CHAR_TILDE) {
      if (filePath.charCodeAt(1) === CHAR_PLUS) {
        return path.join(process.cwd(), filePath.slice(2))
      }

      if (!home) {
        return filePath
      }

      return path.join(home, filePath.slice(1))
    }

    return filePath
  }
}
