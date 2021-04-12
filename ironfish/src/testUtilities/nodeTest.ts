/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishNode } from '../node'
import { IronfishSdk } from '../sdk'
import { v4 as uuid } from 'uuid'
import os from 'os'
import path from 'path'
import { IronfishBlockchain, IronfishCaptain } from '../strategy'
import { IronfishTestVerifier } from './verifier'
import { IronfishTestStrategy } from './strategy'

/**
 * Used as an easy wrapper for testing the node, and blockchain. Use
 * {@link createNodeTest} to create one to make sure you call the proper
 * test lifecycle methods on the NodeTest
 */
export class NodeTest {
  sdk!: IronfishSdk
  node!: IronfishNode
  strategy!: IronfishTestStrategy
  captain!: IronfishCaptain
  chain!: IronfishBlockchain

  setups = new Array<{
    sdk: IronfishSdk
    node: IronfishNode
    captain: IronfishCaptain
    strategy: IronfishTestStrategy
    chain: IronfishBlockchain
  }>()

  async createSetup(): Promise<{
    sdk: IronfishSdk
    node: IronfishNode
    strategy: IronfishTestStrategy
    captain: IronfishCaptain
    chain: IronfishBlockchain
  }> {
    const dataDir = path.join(os.tmpdir(), uuid())
    const verifierClass = IronfishTestVerifier
    const strategyClass = IronfishTestStrategy

    const sdk = await IronfishSdk.init({ dataDir, verifierClass, strategyClass })
    const node = await sdk.node()
    const strategy = node.strategy as IronfishTestStrategy
    const captain = node.captain
    const chain = node.captain.chain

    sdk.config.setOverride('bootstrapNodes', [''])
    await node.openDB()

    const setup = { sdk, node, captain, strategy, chain }
    this.setups.push(setup)
    return setup
  }

  async setup(): Promise<void> {
    const { sdk, node, captain, strategy, chain } = await this.createSetup()

    this.sdk = sdk
    this.node = node
    this.strategy = strategy
    this.captain = captain
    this.chain = chain
  }

  async teardownEach(): Promise<void> {
    for (const { node } of this.setups) {
      await node.shutdown()
    }
  }

  async teardownAll(): Promise<void> {
    for (const { node } of this.setups) {
      await node.closeDB()
    }
  }
}

/** Call this to create a {@link NodeTest} and ensure its test lifecycle
 * methods are called properly like beforeEach, beforeAll, etc
 */
export function createNodeTest(preserveState = false): NodeTest {
  const nodeTest = new NodeTest()

  if (preserveState) {
    beforeAll(() => nodeTest.setup())
    afterEach(() => nodeTest.teardownEach())
    afterAll(() => nodeTest.teardownAll())
  } else {
    beforeEach(() => nodeTest.setup())
    afterEach(() => nodeTest.teardownEach())
    afterEach(() => nodeTest.teardownAll())
  }

  return nodeTest
}
