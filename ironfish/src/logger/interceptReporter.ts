/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ConsolaReporter, ConsolaReporterArgs, ConsolaReporterLogObject } from 'consola'

type LogCallback = (logObj: ConsolaReporterLogObject, args: ConsolaReporterArgs) => void

export class InterceptReporter implements ConsolaReporter {
  callback: LogCallback

  constructor(callback: LogCallback) {
    this.callback = callback
  }

  log(logObj: ConsolaReporterLogObject, args: ConsolaReporterArgs): void {
    this.callback(logObj, args)
  }
}
