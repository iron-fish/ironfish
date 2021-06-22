/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { LogLevel } from 'consola'

/**
 * Maps config log level strings to consola LogLevel values.
 */
const configToLogLevel: {
  [key: string]: LogLevel | undefined
} = Object.freeze({
  fatal: LogLevel.Fatal,
  error: LogLevel.Error,
  warn: LogLevel.Warn,
  log: LogLevel.Log,
  info: LogLevel.Info,
  success: LogLevel.Success,
  debug: LogLevel.Debug,
  trace: LogLevel.Trace,
  silent: LogLevel.Silent,
  verbose: LogLevel.Verbose,
})

/**
 * Converts a config log level string to a consola LogLevel value.
 * @throws `level` does not exist as a key of `configToLogLevel`
 * @param level A config log level string
 */
const configLevelToLogLevel = (level: string): LogLevel => {
  level = level.toLowerCase()
  const configLevel = configToLogLevel[level]
  if (configLevel === undefined) {
    throw new Error(
      `Log level ${level} should be one of the following: ${Object.keys(configToLogLevel).join(
        ', ',
      )}`,
    )
  }

  return configLevel
}

/**
 * Parses a log level config string into tags and log levels.
 *
 * ex: `*:warn,peernetwork:info`
 * @param logLevelConfig A log level config string.
 */
export const parseLogLevelConfig = (
  logLevelConfig: string,
): ReadonlyArray<[string, LogLevel]> => {
  return logLevelConfig.split(',').map((logLevel) => {
    const levelParams = logLevel.split(':')
    // If we don't have a :, try overriding the default log level
    if (levelParams.length === 1) {
      levelParams.unshift('*')
    }
    // We should have 2 levelParams at this point, or the format is wrong
    if (levelParams.length !== 2) {
      throw new Error('Log levels must have format tag:level')
    }

    const tag = levelParams[0].toLowerCase()
    const level = configLevelToLogLevel(levelParams[1])

    return [tag, level]
  })
}
