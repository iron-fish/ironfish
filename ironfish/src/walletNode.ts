/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { AssetsVerifier } from './assets'
import { Config } from './fileStores'
import { Logger } from './logger'
import { RpcServer } from './rpc'
import { Wallet } from './wallet/wallet'
import { WorkerPool } from './workerPool'

export type WalletNode = {
  wallet: Wallet
  config: Config
  logger: Logger
  assetsVerifier: AssetsVerifier
  workerPool: WorkerPool
  rpc: RpcServer
}
