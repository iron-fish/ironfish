/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The reporter intentionally logs to the console, so disable the lint
/* eslint-disable no-console */

import { ConsolaReporterLogObject } from 'consola'
import fs from 'fs'
import { TextReporter } from './text'

export class FileReporter extends TextReporter {
  stream: fs.WriteStream

  constructor(path: string) {
    super()

    this.colorEnabled = false

    this.stream = fs.createWriteStream(path, { flags: 'a' })
  }

  logText(logObj: ConsolaReporterLogObject, args: unknown[]): void {
    const data = args.map(String).join(' ')
    this.stream.write(data + '\n')
  }
}
