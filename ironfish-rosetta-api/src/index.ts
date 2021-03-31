/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Routes, SERVER_PORT } from './config'
import { Server } from './server/server'
import { Logger } from './utils/logger'
import {
  NetworkList,
  NetworkStatus,
  Block,
  BlockTransaction,
  SearchBlocks,
  SearchTransactions,
} from './services'
import { connection } from './config/database'

const server = new Server()

server
  .open(SERVER_PORT)
  .then(() => {
    Logger.info(`Listening on http://localhost:${SERVER_PORT}`)
  })
  .catch((err: string) => {
    Logger.error(`Error: ${err}`)
  })

// Attach services
server.register(Routes.NETWORK_LIST, NetworkList)
server.register(Routes.NETWORK_STATUS, NetworkStatus)
server.register(Routes.BLOCK, Block)
server.register(Routes.BLOCK_TRANSACTION, BlockTransaction)
server.register(Routes.SEARCH_BLOCKS, SearchBlocks)
server.register(Routes.SEARCH_TRANSACTIONS, SearchTransactions)

const init = async () => {
  await connection
}

init().catch((error) => {
  Logger.error(error)
})
