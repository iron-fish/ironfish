/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Consola } from 'consola'
import consola, { LogLevel } from 'consola'
import { parseLogLevelConfig } from './logLevelParser'
import { ConsoleReporter } from './reporters/console'
export * from './reporters/intercept'

export type Logger = Consola

export const ConsoleReporterInstance = new ConsoleReporter()

/**
 * Updates the reporter's log levels from a config string.
 *
 * Format is like so: `*:warn,sdk:info`
 * @param logLevelConfig A log level string formatted for use in config files or env vars
 */
export const setLogLevelFromConfig = (logLevelConfig: string): void => {
  const parsedConfig = parseLogLevelConfig(logLevelConfig)

  for (const config of parsedConfig) {
    ConsoleReporterInstance.setLogLevel(config[0], config[1])
  }
}

/**
 * Updates the reporter's log prefix from a config string.
 *
 * Format is like so: `[%time%] [%level%] [%tag%]`
 * @param logPrefix A string formatted for use in config files or environment vars
 */
export const setLogPrefixFromConfig = (logPrefix: string): void => {
  ConsoleReporterInstance.logPrefix = logPrefix
}

/**
 * Enables color when logging
 */
export const setLogColorEnabledFromConfig = (enabled: boolean): void => {
  ConsoleReporterInstance.colorEnabled = enabled
}

/**
 * Creates a logger instance with the desired default settings.
 */
export const createRootLogger = (): Logger => {
  return consola.create({
    reporters: [ConsoleReporterInstance],
    // We're filtering at the reporter level right now so we allow all logs through,
    // but if Consola provides a way to set tag-specific log levels, we should use that.
    level: LogLevel.Verbose,
  })
}
