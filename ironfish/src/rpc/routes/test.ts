/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishNode } from '../../node'
import { IronfishSdk } from '../../sdk'
import { MemoryAdapter } from '../adapters'
import os from 'os'
import { v4 as uuid } from 'uuid'
import path from 'path'
import { IronfishMemoryClient } from '../clients'
/**
 * Used as an easy wrapper for an RPC route test. Use {@link createRouteTest}
 * to create one to make sure you call the proper test lifecycle methods on
 * the RouteTest
 */
export class RouteTest {
  adapter!: MemoryAdapter
  node!: IronfishNode
  sdk!: IronfishSdk
  client!: IronfishMemoryClient

  async beforeAll(): Promise<void> {
    const dataDir = path.join(os.tmpdir(), uuid())
    const sdk = await IronfishSdk.init({ dataDir })
    const node = await sdk.node()
    const adapter = new MemoryAdapter()
    await node.rpc.mount(adapter)

    sdk.config.setOverride('bootstrapNodes', [''])
    await node.openDB()

    this.adapter = adapter
    this.node = node
    this.sdk = sdk
  }

  async afterEach(): Promise<void> {
    await this.node.shutdown()
  }

  async afterAll(): Promise<void> {
    await this.node.closeDB()
  }
}

/** Call this to create a {@link RouteTest} and ensure its test lifecycle
 * methods are called properly like beforeEach, beforeAll, etc
 */
export function createRouteTest(): RouteTest {
  const routeTest = new RouteTest()
  beforeAll(() => routeTest.beforeAll())
  afterEach(() => routeTest.afterEach())
  afterAll(() => routeTest.afterAll())
  return routeTest
}
