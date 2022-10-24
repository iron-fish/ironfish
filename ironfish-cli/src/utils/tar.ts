/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { spawn } from 'child_process'
import path from 'path'
import tar from 'tar'

async function zipDir(source: string, dest: string, excludes: string[] = []): Promise<void> {
  const sourceDir = path.dirname(source)
  const sourceFile = path.basename(source)
  const patterns = excludes.map((e) => new RegExp(e))

  await tar.create(
    {
      gzip: true,
      file: dest,
      C: sourceDir,
      filter: function (path) {
        if (patterns.find((p) => p.test(path))) {
          return false
        } else {
          return true
        }
      },
    },
    [sourceFile],
  )
}

function unzipTar(source: string, dest: string): Promise<number | null> {
  return new Promise<number | null>((resolve, reject) => {
    const process = spawn('tar', ['-xvzf', source, '-C', dest])
    process.on('exit', (code) => resolve(code))
    process.on('error', (error) => reject(error))
  })
}

export const TarUtils = { zipDir, unzipTar }
