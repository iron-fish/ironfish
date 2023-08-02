/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import './matchers'
import { Blockchain } from '../blockchain'
import { Verifier } from '../consensus/verifier'
import { ConfigOptions } from '../fileStores/config'
import { PeerNetwork } from '../network'
import { FullNode } from '../node'
import { IronfishSdk } from '../sdk'
import { Syncer } from '../syncer'
import { Wallet } from '../wallet'
import { WorkerPool } from '../workerPool'
import { TestStrategy } from './strategy'
import { getUniqueTestDataDir } from './utils'

export type NodeTestOptions =
  | {
      config?: Partial<ConfigOptions>
      autoSeed?: boolean
    }
  | undefined

/**
 * Used as an easy wrapper for testing the node, and blockchain. Use
 * {@link createNodeTest} to create one to make sure you call the proper
 * test lifecycle methods on the NodeTest
 */
export class NodeTest {
  options: NodeTestOptions

  sdk!: IronfishSdk
  node!: FullNode
  strategy!: TestStrategy
  verifier!: Verifier
  chain!: Blockchain
  wallet!: Wallet
  peerNetwork!: PeerNetwork
  syncer!: Syncer
  workerPool!: WorkerPool

  setups = new Array<{
    sdk: IronfishSdk
    node: FullNode
    strategy: TestStrategy
    chain: Blockchain
    wallet: Wallet
    peerNetwork: PeerNetwork
    syncer: Syncer
    workerPool: WorkerPool
  }>()

  constructor(options: NodeTestOptions = {}) {
    this.options = options
  }

  async createSetup(options?: NodeTestOptions): Promise<{
    sdk: IronfishSdk
    node: FullNode
    strategy: TestStrategy
    verifier: Verifier
    chain: Blockchain
    wallet: Wallet
    peerNetwork: PeerNetwork
    syncer: Syncer
    workerPool: WorkerPool
  }> {
    if (!options) {
      options = this.options
    }

    const dataDir = getUniqueTestDataDir()
    const strategyClass = TestStrategy

    const sdk = await IronfishSdk.init({ dataDir, strategyClass })

    sdk.config.setOverride('bootstrapNodes', [''])
    sdk.config.setOverride('networkId', 2)
    sdk.config.setOverride('enableListenP2P', false)
    sdk.config.setOverride('enableTelemetry', false)
    sdk.config.setOverride('enableAssetVerification', false)
    sdk.config.setOverride('confirmations', 0)

    // Allow tests to override default settings
    if (options?.config) {
      for (const key in options.config) {
        const configKey = key as keyof ConfigOptions
        const configValue = options.config[configKey]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sdk.config.setOverride(key as keyof ConfigOptions, configValue as any)
      }
    }

    const node = await sdk.node({ autoSeed: this.options?.autoSeed })
    const strategy = node.strategy as TestStrategy
    const chain = node.chain
    const wallet = node.wallet
    const peerNetwork = node.peerNetwork
    const syncer = node.syncer
    const verifier = node.chain.verifier
    const workerPool = node.workerPool

    verifier.enableVerifyTarget = false

    await node.openDB()

    const setup = {
      sdk,
      node,
      strategy,
      verifier,
      chain,
      wallet,
      peerNetwork,
      syncer,
      workerPool,
    }

    this.setups.push(setup)
    return setup
  }

  async setup(): Promise<void> {
    const { sdk, node, strategy, verifier, chain, wallet, peerNetwork, syncer, workerPool } =
      await this.createSetup()

    this.sdk = sdk
    this.node = node
    this.strategy = strategy
    this.verifier = verifier
    this.chain = chain
    this.wallet = wallet
    this.peerNetwork = peerNetwork
    this.syncer = syncer
    this.workerPool = workerPool
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
    beforeAll(() => nodeTest.setup(), 10000)
    afterAll(() => nodeTest.teardownAll())
  } else {
    beforeEach(() => nodeTest.setup(), 10000)
    afterEach(() => nodeTest.teardownEach())
    afterEach(() => nodeTest.teardownAll())
  }

  return nodeTest
}
