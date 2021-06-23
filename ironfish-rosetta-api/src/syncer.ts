/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { connection } from './config/database'
import { Syncer } from './syncer/'
import { Logger } from './utils/logger'

const SLEEP_BETWEEN_SYNC = 20000

const startSyncer = async () => {
  await connection

  const syncer = await Syncer.new()

  for (;;) {
    await syncer.start()
    await new Promise((resolve) => setTimeout(resolve, SLEEP_BETWEEN_SYNC))
  }
}

startSyncer().catch((error) => {
  Logger.error(error)
})
