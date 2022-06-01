/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConsolaReporterLogObject } from 'consola'
import { LogArgs } from '../index'
import { LogsDatabase } from '../logDatabase'
import { logObjToJSON } from './console'
import { InterceptReporter } from './intercept'

export const createNewLogsDBReporter = async (dataDir: string): Promise<InterceptReporter> => {
  const db = await LogsDatabase.init(dataDir)

  return new InterceptReporter((logObj: ConsolaReporterLogObject): void => {
    const json = logObjToJSON(logObj)
    if ('dbTable' in json) {
      const filteredEntry = Object.fromEntries(
        Object.entries(json).filter(([key]) => {
          return !['dbTable', 'message', 'tag', 'date', 'level'].includes(key)
        }),
      )
      void db.insert(filteredEntry as LogArgs, json.dbTable as string)
    }
  })
}
