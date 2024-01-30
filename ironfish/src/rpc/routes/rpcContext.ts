/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { AssetsVerifier } from '../../assets'
import { Config, InternalStore } from '../../fileStores'
import { FileSystem } from '../../fileSystems'
import { Logger } from '../../logger'
import { Network } from '../../networks'
import { Wallet } from '../../wallet'
import { WorkerPool } from '../../workerPool'
import { RpcRequest } from '../request'
import { RpcServer } from '../server'

export type RpcContext = Partial<{
  config: Config
  internal: InternalStore
  files: FileSystem
  wallet: Wallet
  workerPool: WorkerPool
  logger: Logger
  rpc: RpcServer
  assetsVerifier: AssetsVerifier
  network: Network
  shutdown: () => Promise<void>
}>

export function AssertHasRpcContext<TKeys extends keyof RpcContext>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: RpcRequest<any, any>,
  context: RpcContext,
  ...keys: TKeys[]
): asserts context is Required<Pick<RpcContext, TKeys>> {
  Assert.hasKeys(
    context,
    keys,
    `Expected RPC context to have keys ${String(keys)} but has ${String(Object.keys(context))}`,
  )
}
