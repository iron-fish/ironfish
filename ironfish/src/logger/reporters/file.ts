/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The reporter intentionally logs to the console, so disable the lint
/* eslint-disable no-console */

import type fs from 'fs'
import { ConsolaReporterLogObject } from 'consola'
import { Assert } from '../../assert'
import { NodeFileProvider } from '../../fileSystems'
import { TextReporter } from './text'

export class FileReporter extends TextReporter {
  fs: NonNullable<NodeFileProvider['fsSync']>
  stream: fs.WriteStream

  constructor(fs: NodeFileProvider, path: string) {
    super()

    this.colorEnabled = false

    Assert.isNotNull(fs.fsSync)
    this.fs = fs.fsSync
    this.stream = this.fs.createWriteStream(path, { flags: 'a' })
  }

  logText(logObj: ConsolaReporterLogObject, args: unknown[]): void {
    const data = args.map(String).join(' ')
    this.stream.write(data + '\n')
  }
}
