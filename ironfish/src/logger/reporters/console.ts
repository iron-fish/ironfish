/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The reporter intentionally logs to the console, so disable the lint
/* eslint-disable no-console */

import { ConsolaReporterLogObject, logType } from 'consola'
import { Assert } from '../../assert'
import { IJSON } from '../../serde'
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
  Assert.isNotUndefined(logger)
  return logger
}

export const logObjToJSON = (logObj: ConsolaReporterLogObject): string => {
  const objectArgs: Record<string, unknown>[] = logObj.args.filter(
    (a) => typeof a === 'object',
  ) as Record<string, unknown>[]
  const otherArgs = logObj.args.filter((a) => typeof a != 'object')

  const toLog = {
    ...objectArgs[0],
    level: logObj.level,
    tag: logObj.tag,
    date: logObj.date,
    message: otherArgs.join(' '),
  }

  return IJSON.stringify(toLog)
}

export class ConsoleReporter extends TextReporter {
  logToJSON = false

  logText(logObj: ConsolaReporterLogObject, args: unknown[]): void {
    const logger = getConsoleLogger(logObj.type)
    this.logToJSON ? logger(logObjToJSON(logObj)) : logger(...args)
  }
}
