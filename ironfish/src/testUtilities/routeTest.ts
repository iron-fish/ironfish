/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishNode } from '../node'
import { IronfishSdk } from '../sdk'
import { MemoryAdapter } from '../rpc/adapters'
import { IronfishMemoryClient } from '../rpc/clients'
import { NodeTest } from './nodeTest'
import { IronfishBlockchain } from '../blockchain'
import { IronfishTestStrategy } from './strategy'
import { PeerNetwork } from '../network/peerNetwork'
import { Syncer } from '../syncer'

/**
 * Used as an easy wrapper for an RPC route test. Use {@link createRouteTest}
 * to create one to make sure you call the proper test lifecycle methods on
 * the RouteTest
 */
export class RouteTest extends NodeTest {
  adapter!: MemoryAdapter
  client!: IronfishMemoryClient

  async createSetup(): Promise<{
    sdk: IronfishSdk
    node: IronfishNode
    strategy: IronfishTestStrategy
    chain: IronfishBlockchain
    peerNetwork: PeerNetwork
    syncer: Syncer
    adapter: MemoryAdapter
    client: IronfishMemoryClient
  }> {
    const setup = await super.createSetup()

    const client = new IronfishMemoryClient()
    await client.connect(setup.node)
    const adapter = client.adapter

    return { ...setup, adapter, client }
  }

  async setup(): Promise<void> {
    const {
      sdk,
      node,
      strategy,
      chain,
      peerNetwork,
      syncer,
      client,
      adapter,
    } = await this.createSetup()

    this.sdk = sdk
    this.node = node
    this.strategy = strategy
    this.chain = chain
    this.syncer = syncer
    this.peerNetwork = peerNetwork
    this.client = client
    this.adapter = adapter
  }
}

/** Call this to create a {@link RouteTest} and ensure its test lifecycle
 * methods are called properly like beforeEach, beforeAll, etc
 */
export function createRouteTest(): RouteTest {
  const routeTest = new RouteTest()
  beforeAll(() => routeTest.setup())
  afterEach(() => routeTest.teardownEach())
  afterAll(() => routeTest.teardownAll())
  return routeTest
}
