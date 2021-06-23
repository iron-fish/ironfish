/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { run } from 'graphile-worker'
import { DATABASE_CONNECTION_STRING } from '../config'
import { Logger } from '../utils/logger'
import { getFundsTask } from './FaucetTask'

async function main() {
  const runner = await run({
    connectionString: DATABASE_CONNECTION_STRING,
    concurrency: 1,
    // Install signal handlers for graceful shutdown on SIGINT, SIGTERM, etc
    noHandleSignals: false,
    pollInterval: 1000,
    taskList: {
      getFundsTask,
    },
  })

  await runner.promise
}

main().catch((err) => {
  Logger.error(err)
  process.exit(1)
})
