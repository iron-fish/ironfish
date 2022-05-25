/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The reporter intentionally logs to the console, so disable the lint
/* eslint-disable no-console */

import { ConsolaReporterLogObject, logType } from 'consola'
import { Assert } from '../../assert'
import { TextReporter } from './text'

const silentLogger = (): void => {
  /* noop */
}

export const loggers: Record<logType, typeof console.log> = {
  fatal: console.error,
  error: console.error,
  warn: console.warn,
  log: console.log,
  info: console.info,
  success: console.info,
  debug: console.debug,
  trace: console.trace,
  verbose: console.debug,
  ready: console.info,
  start: console.info,
  silent: silentLogger,
}

export const getConsoleLogger = (logType: logType): typeof console.log => {
  const logger = loggers[logType]
  return logger
}

export class ConsoleReporter extends TextReporter {
  logText(logObj: ConsolaReporterLogObject, args: unknown[]): void {
    getConsoleLogger(logObj.type)(...args)
  }
}
