/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Server } from './server/server'
import { Logger } from './utils/logger'

const PORT = 8000

const server = new Server()

if (process.env.DOCKER_VERIFY) {
  process.exit(0)
}

server
  .open(PORT)
  .then(() => {
    Logger.info(`Listening on http://localhost:${PORT}`)
  })
  .catch((err: string) => {
    Logger.error(`Error: ${err}`)
  })
