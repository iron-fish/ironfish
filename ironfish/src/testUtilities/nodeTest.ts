/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishNode } from '../node'
import { IronfishSdk } from '../sdk'
import { v4 as uuid } from 'uuid'
import os from 'os'
import path from 'path'
import { IronfishBlockchain } from '../strategy'
import { IronfishTestVerifier } from './verifier'
import { IronfishTestStrategy } from './strategy'
import { ConfigOptions } from '../fileStores/config'
import { PeerNetwork } from '../network'

export type NodeTestOptions = { config?: Partial<ConfigOptions> } | undefined

/**
 * Used as an easy wrapper for testing the node, and blockchain. Use
 * {@link createNodeTest} to create one to make sure you call the proper
 * test lifecycle methods on the NodeTest
 */
export class NodeTest {
  options: NodeTestOptions

  sdk!: IronfishSdk
  node!: IronfishNode
  strategy!: IronfishTestStrategy
  chain!: IronfishBlockchain
  peerNetwork!: PeerNetwork

  setups = new Array<{
    sdk: IronfishSdk
    node: IronfishNode
    strategy: IronfishTestStrategy
    chain: IronfishBlockchain
    peerNetwork: PeerNetwork
  }>()

  constructor(options: NodeTestOptions = {}) {
    this.options = options
  }

  async createSetup(
    options?: NodeTestOptions,
  ): Promise<{
    sdk: IronfishSdk
    node: IronfishNode
    strategy: IronfishTestStrategy
    chain: IronfishBlockchain
    peerNetwork: PeerNetwork
  }> {
    if (!options) options = this.options

    const dataDir = path.join(os.tmpdir(), uuid())
    const verifierClass = IronfishTestVerifier
    const strategyClass = IronfishTestStrategy

    const sdk = await IronfishSdk.init({ dataDir, verifierClass, strategyClass })
    const node = await sdk.node()
    const strategy = node.strategy as IronfishTestStrategy
    const chain = node.chain
    const peerNetwork = node.peerNetwork

    sdk.config.setOverride('bootstrapNodes', [''])

    // Allow tests to override default settings
    if (options?.config) {
      for (const key in options.config) {
        const configKey = key as keyof ConfigOptions
        const configValue = options.config[configKey]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sdk.config.setOverride(key as keyof ConfigOptions, configValue as any)
      }
    }

    await node.openDB()

    const setup = { sdk, node, strategy, chain, peerNetwork }
    this.setups.push(setup)
    return setup
  }

  async setup(): Promise<void> {
    const { sdk, node, strategy, chain } = await this.createSetup()

    this.sdk = sdk
    this.node = node
    this.strategy = strategy
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
export function createNodeTest(preserveState = false, options: NodeTestOptions = {}): NodeTest {
  const nodeTest = new NodeTest(options)

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
