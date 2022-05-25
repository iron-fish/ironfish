/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ConsolaReporterLogObject } from 'consola'
import consola, { LogLevel } from 'consola'
import { Logger } from './index'
import { getConsoleLogger, InterceptReporter } from './reporters'
export * from './reporters/intercept'

export const createJSONLogger = (): Logger => {
  const JSONReporter = new InterceptReporter((logObj: ConsolaReporterLogObject): void => {
    const consoleLogger = getConsoleLogger(logObj.type)
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

    consoleLogger(JSON.stringify(toLog))
  })

  return consola.create({
    reporters: [JSONReporter],
    level: LogLevel.Verbose,
  })
}
