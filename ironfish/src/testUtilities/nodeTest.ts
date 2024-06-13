/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import './matchers'
import { FishHashContext } from '@ironfish/rust-nodejs'
import { Blockchain } from '../blockchain'
import { Verifier } from '../consensus/verifier'
import { ConfigOptions } from '../fileStores/config'
import { PeerNetwork } from '../network'
import { Network, NetworkDefinition } from '../networks'
import { FullNode } from '../node'
import { IronfishSdk } from '../sdk'
import { IJSON } from '../serde'
import { Syncer } from '../syncer'
import { Wallet } from '../wallet'
import { WorkerPool } from '../workerPool'
import { getUniqueTestDataDir } from './utils'

export type NodeTestOptions =
  | {
      config?: Partial<ConfigOptions>
      autoSeed?: boolean
      networkDefinition?: NetworkDefinition
      dataDir?: string
    }
  | undefined

// Create global FishHash context for tests
export const FISH_HASH_CONTEXT = new FishHashContext(false)

/**
 * Used as an easy wrapper for testing the node, and blockchain. Use
 * {@link createNodeTest} to create one to make sure you call the proper
 * test lifecycle methods on the NodeTest
 */
export class NodeTest {
  options: NodeTestOptions

  sdk!: IronfishSdk
  node!: FullNode
  network!: Network
  verifier!: Verifier
  chain!: Blockchain
  wallet!: Wallet
  peerNetwork!: PeerNetwork
  syncer!: Syncer
  workerPool!: WorkerPool

  setups = new Array<{
    sdk: IronfishSdk
    node: FullNode
    network: Network
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
    network: Network
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

    const dataDir = options?.dataDir || getUniqueTestDataDir()

    const sdk = await IronfishSdk.init({ dataDir })

    sdk.config.setOverride('bootstrapNodes', [''])
    sdk.config.setOverride('enableListenP2P', false)
    sdk.config.setOverride('enableTelemetry', false)
    sdk.config.setOverride('enableAssetVerification', false)
    sdk.config.setOverride('confirmations', 0)
    sdk.config.setOverride('nodeWorkers', 0)

    // Allow tests to override default settings
    if (options?.config) {
      for (const key in options.config) {
        const configKey = key as keyof ConfigOptions
        const configValue = options.config[configKey]
        sdk.config.setOverride(key as keyof ConfigOptions, configValue)
      }
    }

    let networkOptions: { networkId: 2 } | { customNetworkPath: string } = { networkId: 2 }
    if (options?.networkDefinition) {
      const dir = getUniqueTestDataDir()
      await sdk.fileSystem.mkdir(dir, { recursive: true })
      const networkFile = sdk.fileSystem.join(dir, 'customNetwork.json')
      await sdk.fileSystem.writeFile(networkFile, IJSON.stringify(options.networkDefinition))

      networkOptions = { customNetworkPath: networkFile }
    }

    const node = await sdk.node({
      autoSeed: this.options?.autoSeed,
      ...networkOptions,
    })

    const network = node.network
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
      network,
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
    const { sdk, node, network, verifier, chain, wallet, peerNetwork, syncer, workerPool } =
      await this.createSetup()

    this.sdk = sdk
    this.node = node
    this.network = network
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
    afterEach(async () => {
      await nodeTest.teardownEach()
      await nodeTest.teardownAll()
    })
  }

  return nodeTest
}
