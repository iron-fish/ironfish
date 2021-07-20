/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Accounts } from '../account'
import { Blockchain } from '../blockchain'
import { Verifier } from '../consensus'
import { MiningDirector } from '../mining/director'
import { PeerNetwork } from '../network/peerNetwork'
import { IronfishNode } from '../node'
import { MemoryAdapter } from '../rpc/adapters'
import { IronfishMemoryClient } from '../rpc/clients'
import { IronfishSdk } from '../sdk'
import { Syncer } from '../syncer'
import { NodeTest } from './nodeTest'
import { TestStrategy } from './strategy'

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
    strategy: TestStrategy
    verifier: Verifier
    chain: Blockchain
    accounts: Accounts
    peerNetwork: PeerNetwork
    syncer: Syncer
    miningDirector: MiningDirector
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
      accounts,
      peerNetwork,
      syncer,
      miningDirector,
      client,
      adapter,
    } = await this.createSetup()

    this.sdk = sdk
    this.node = node
    this.strategy = strategy
    this.chain = chain
    this.accounts = accounts
    this.syncer = syncer
    this.peerNetwork = peerNetwork
    this.client = client
    this.adapter = adapter
    this.miningDirector = miningDirector
  }
}

/** Call this to create a {@link RouteTest} and ensure its test lifecycle
 * methods are called properly like beforeEach, beforeAll, etc
 */
export function createRouteTest(): RouteTest {
  const routeTest = new RouteTest()
  beforeAll(() => routeTest.setup(), 10000)
  afterEach(() => routeTest.teardownEach())
  afterAll(() => routeTest.teardownAll())
  return routeTest
}
