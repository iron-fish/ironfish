/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Blockchain } from '../blockchain'
import { Verifier } from '../consensus'
import { createRootLogger } from '../logger'
import { PeerNetwork } from '../network/peerNetwork'
import { FullNode } from '../node'
import { ALL_API_NAMESPACES } from '../rpc'
import { RpcMemoryAdapter } from '../rpc/adapters'
import { RpcMemoryClient } from '../rpc/clients'
import { IronfishSdk } from '../sdk'
import { Syncer } from '../syncer'
import { Wallet } from '../wallet'
import { WorkerPool } from '../workerPool'
import { NodeTest } from './nodeTest'
import { TestStrategy } from './strategy'

/**
 * Used as an easy wrapper for an RPC route test. Use {@link createRouteTest}
 * to create one to make sure you call the proper test lifecycle methods on
 * the RouteTest
 */
export class RouteTest extends NodeTest {
  adapter!: RpcMemoryAdapter
  client!: RpcMemoryClient

  async createSetup(): Promise<{
    sdk: IronfishSdk
    node: FullNode
    strategy: TestStrategy
    verifier: Verifier
    chain: Blockchain
    wallet: Wallet
    peerNetwork: PeerNetwork
    syncer: Syncer
    workerPool: WorkerPool
    client: RpcMemoryClient
  }> {
    const setup = await super.createSetup()

    const logger = createRootLogger().withTag('memoryclient')
    const client = new RpcMemoryClient(logger, setup.node.rpc.getRouter(ALL_API_NAMESPACES))

    return { ...setup, client }
  }

  async setup(): Promise<void> {
    const { sdk, node, strategy, chain, wallet, peerNetwork, syncer, workerPool, client } =
      await this.createSetup()

    this.sdk = sdk
    this.node = node
    this.strategy = strategy
    this.chain = chain
    this.wallet = wallet
    this.syncer = syncer
    this.peerNetwork = peerNetwork
    this.client = client
    this.workerPool = workerPool
  }
}

/** Call this to create a {@link RouteTest} and ensure its test lifecycle
 * methods are called properly like beforeEach, beforeAll, etc
 */
export function createRouteTest(preserveState = false): RouteTest {
  const routeTest = new RouteTest()

  if (preserveState) {
    beforeAll(() => routeTest.setup(), 10000)
    afterEach(() => routeTest.teardownEach())
    afterAll(() => routeTest.teardownAll())
  } else {
    beforeEach(() => routeTest.setup(), 10000)
    afterEach(() => routeTest.teardownEach())
    afterEach(() => routeTest.teardownAll())
  }

  return routeTest
}
