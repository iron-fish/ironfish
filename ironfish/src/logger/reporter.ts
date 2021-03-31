/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The reporter intentionally logs to the console, so disable the lint
/* eslint-disable no-console */

import { ConsolaReporter, ConsolaReporterLogObject, LogLevel, logType } from 'consola'
import { format as formatDate } from 'date-fns'
import colors from 'colors/safe'
import { StringUtils } from '../utils/strings'

function isUnreachable(x: never): never {
  throw new Error(x)
}

// Do nothing when log level is 'silent'
const silentLogger = () => {
  /* noop */
}

const COLORS = [
  colors.red,
  colors.green,
  colors.yellow,
  colors.blue,
  colors.magenta,
  colors.cyan,
  colors.white,
  colors.gray,
  colors.grey,
]

export class ConsoleReporter implements ConsolaReporter {
  /**
   * Maps tags to log level overrides.
   */
  readonly tagToLogLevelMap: Map<string, LogLevel> = new Map<string, LogLevel>()

  /**
   * The default minimum log level to display (inclusive),
   * if no specific overrides apply.
   */
  defaultMinimumLogLevel: LogLevel = LogLevel.Info

  /**
   * Prefix template string to prepend to all logs.
   */
  logPrefix = ''

  /**
   * enable colorizing log elements
   */
  colorEnabled = false

  /**
   * Updates the reporter's log levels for a given tag.
   *
   * `*` as a tag sets `defaultMinimumLogLevel`.
   * @param tag A tag set on a logger.
   * @param level Filter out logs less than or equal to this value.
   */
  setLogLevel(tag: string, level: LogLevel): void {
    if (tag === '*') {
      this.defaultMinimumLogLevel = level
    } else {
      this.tagToLogLevelMap.set(tag, level)
    }
  }

  /**
   * Converts a logType to a console logging function.
   * @param level a logType from logObj
   */
  private getConsoleLogger(type: logType) {
    switch (type) {
      case 'fatal':
        return console.error
      case 'error':
        return console.error
      case 'warn':
        return console.warn
      case 'log':
        return console.log
      case 'info':
        return console.info
      case 'success':
        return console.info
      case 'debug':
        return console.debug
      case 'trace':
        return console.trace
      case 'silent':
        return silentLogger
      case 'verbose':
        return console.debug
      case 'ready':
        return console.info
      case 'start':
        return console.info
      default:
        isUnreachable(type)
    }
  }

  /**
   * Determines whether to output logs based on the configured minimum log levels.
   * @param logObj a logObj instance from the consola reporter's log function
   */
  private shouldLog(logObj: ConsolaReporterLogObject): boolean {
    // logs with multiple tags come with the tags joined with ':'
    const tags = logObj.tag.split(':')
    // Start with the default log level, then check tags from least specific
    // to most specific and override the log level if we have an override for that tag.
    let level: LogLevel = this.defaultMinimumLogLevel
    for (const tag of tags) {
      const tagLevel = this.tagToLogLevelMap.get(tag)
      if (tagLevel !== undefined) {
        level = tagLevel
      }
    }

    return logObj.level <= level
  }

  /**
   * Materializes the variables on the logPrefix template string into a new string
   * @param logObj a logObj instance from the consola reporter's log function
   */
  private buildLogPrefix(logObj: ConsolaReporterLogObject): string {
    const formattedDate = formatDate(logObj.date, 'HH:mm:ss.SSS')
    let formattedTag = logObj.tag

    if (this.colorEnabled && formattedTag) {
      const hash = StringUtils.hashToNumber(logObj.tag)
      const index = hash % COLORS.length
      const color = COLORS[index]
      formattedTag = color(logObj.tag)
    }

    return this.logPrefix
      .replace(/%time%/g, formattedDate)
      .replace(/%level%/g, logObj.type)
      .replace(/%tag%/g, formattedTag)
  }

  log(logObj: ConsolaReporterLogObject): void {
    if (!this.shouldLog(logObj)) return

    const logOutput = this.getConsoleLogger(logObj.type)
    logOutput(...(this.logPrefix ? [this.buildLogPrefix(logObj)] : []), ...logObj.args)
  }
}
