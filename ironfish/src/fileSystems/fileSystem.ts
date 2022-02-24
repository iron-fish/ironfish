/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type fs from 'fs'

export abstract class FileSystem {
  abstract init(): Promise<FileSystem>
  abstract access(path: fs.PathLike, mode?: number | undefined): Promise<void>
  abstract writeFile(
    path: string,
    data: string,
    options?: { mode?: fs.Mode; flag?: fs.OpenMode },
  ): Promise<void>
  abstract readFile(path: string): Promise<string>
  abstract mkdir(path: string, options: { recursive?: boolean }): Promise<void>
  abstract resolve(path: string): string
  abstract join(...paths: string[]): string
}
