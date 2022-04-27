/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import os from 'os'
import { v4 as uuid } from 'uuid'
import { Accounts, AccountsDB } from './account'
import { Blockchain } from './blockchain'
import {
  Config,
  ConfigOptions,
  DEFAULT_DATA_DIR,
  HostsStore,
  InternalStore,
} from './fileStores'
import { FileSystem } from './fileSystems'
import { createRootLogger, Logger } from './logger'
import { MemPool } from './memPool'
import { MetricsMonitor } from './metrics'
import { MiningManager } from './mining'
import { PeerNetwork, PrivateIdentity } from './network'
import { IsomorphicWebSocketConstructor } from './network/types'
import { Package } from './package'
import { Platform } from './platform'
import { RpcServer } from './rpc/server'
import { Strategy } from './strategy'
import { Syncer } from './syncer'
import { Telemetry } from './telemetry/telemetry'
import { WorkerPool } from './workerPool'

export class IronfishNode {
  chain: Blockchain
  strategy: Strategy
  config: Config
  internal: InternalStore
  accounts: Accounts
  logger: Logger
  miningManager: MiningManager
  metrics: MetricsMonitor
  memPool: MemPool
  workerPool: WorkerPool
  files: FileSystem
  rpc: RpcServer
  peerNetwork: PeerNetwork
  syncer: Syncer
  pkg: Package
  telemetry: Telemetry

  started = false
  shutdownPromise: Promise<void> | null = null
  shutdownResolve: (() => void) | null = null

  private constructor({
    pkg,
    chain,
    files,
    config,
    internal,
    accounts,
    strategy,
    metrics,
    memPool,
    workerPool,
    logger,
    webSocket,
    telemetry,
    privateIdentity,
    hostsStore,
  }: {
    pkg: Package
    files: FileSystem
    config: Config
    internal: InternalStore
    accounts: Accounts
    chain: Blockchain
    strategy: Strategy
    metrics: MetricsMonitor
    memPool: MemPool
    workerPool: WorkerPool
    logger: Logger
    webSocket: IsomorphicWebSocketConstructor
    telemetry: Telemetry
    privateIdentity?: PrivateIdentity
    hostsStore: HostsStore
  }) {
    this.files = files
    this.config = config
    this.internal = internal
    this.accounts = accounts
    this.chain = chain
    this.strategy = strategy
    this.metrics = metrics
    this.miningManager = new MiningManager({ chain, memPool, node: this, telemetry })
    this.memPool = memPool
    this.workerPool = workerPool
    this.rpc = new RpcServer(this)
    this.logger = logger
    this.pkg = pkg
    this.telemetry = telemetry

    this.peerNetwork = new PeerNetwork({
      identity: privateIdentity,
      agent: Platform.getAgent(pkg),
      port: config.get('peerPort'),
      name: config.get('nodeName'),
      maxPeers: config.get('maxPeers'),
      minPeers: config.get('minPeers'),
      listen: config.get('enableListenP2P'),
      enableSyncing: config.get('enableSyncing'),
      targetPeers: config.get('targetPeers'),
      logPeerMessages: config.get('logPeerMessages'),
      simulateLatency: config.get('p2pSimulateLatency'),
      bootstrapNodes: config.getArray('bootstrapNodes'),
      webSocket: webSocket,
      node: this,
      chain: chain,
      strategy: strategy,
      metrics: this.metrics,
      hostsStore: hostsStore,
    })

    this.syncer = new Syncer({
      chain,
      metrics,
      logger,
      telemetry,
      peerNetwork: this.peerNetwork,
      strategy: this.strategy,
      blocksPerMessage: config.get('blocksPerMessage'),
    })

    this.config.onConfigChange.on((key, value) => this.onConfigChange(key, value))
  }

  static async init({
    pkg: pkg,
    databaseName,
    dataDir,
    config,
    internal,
    autoSeed,
    logger = createRootLogger(),
    metrics,
    files,
    strategyClass,
    webSocket,
    privateIdentity,
  }: {
    pkg: Package
    dataDir?: string
    config?: Config
    internal?: InternalStore
    autoSeed?: boolean
    databaseName?: string
    logger?: Logger
    metrics?: MetricsMonitor
    files: FileSystem
    strategyClass: typeof Strategy | null
    webSocket: IsomorphicWebSocketConstructor
    privateIdentity?: PrivateIdentity
  }): Promise<IronfishNode> {
    logger = logger.withTag('ironfishnode')
    dataDir = dataDir || DEFAULT_DATA_DIR

    if (!config) {
      config = new Config(files, dataDir)
      await config.load()
    }

    if (!internal) {
      internal = new InternalStore(files, dataDir)
      await internal.load()
    }

    const hostsStore = new HostsStore(files, dataDir)
    await hostsStore.load()

    if (databaseName) {
      config.setOverride('databaseName', databaseName)
    }

    let workers = config.get('nodeWorkers')
    if (workers === -1) {
      workers = os.cpus().length - 1

      const maxWorkers = config.get('nodeWorkersMax')
      if (maxWorkers !== -1) {
        workers = Math.min(workers, maxWorkers)
      }
    }
    const workerPool = new WorkerPool({ metrics, numWorkers: workers })

    strategyClass = strategyClass || Strategy
    const strategy = new strategyClass(workerPool)

    metrics = metrics || new MetricsMonitor({ logger })

    const chain = new Blockchain({
      location: config.chainDatabasePath,
      strategy,
      logger,
      metrics,
      autoSeed,
      workerPool,
    })

    const telemetry = new Telemetry({
      chain,
      logger,
      config,
      metrics,
      workerPool,
      defaultTags: [{ name: 'version', value: pkg.version }],
      defaultFields: [
        { name: 'node_id', type: 'string', value: internal.get('telemetryNodeId') },
        { name: 'session_id', type: 'string', value: uuid() },
      ],
    })

    const memPool = new MemPool({ chain, metrics, logger })

    const accountDB = new AccountsDB({
      location: config.accountDatabasePath,
      workerPool,
      files,
    })

    const accounts = new Accounts({ database: accountDB, workerPool: workerPool, chain: chain })

    return new IronfishNode({
      pkg,
      chain,
      strategy,
      files,
      config,
      internal,
      accounts,
      metrics,
      memPool,
      workerPool,
      logger,
      webSocket,
      telemetry,
      privateIdentity,
      hostsStore,
    })
  }

  /**
   * Load the databases and initialize node components.
   * Set `upgrade` to change if the schema version is upgraded. Set `load` to false to tell components not to load data from the database. Useful if you don't want data loaded when performing a migration that might cause an incompatability crash.
   */
  async openDB(
    options: { upgrade?: boolean; load?: boolean } = { upgrade: true, load: true },
  ): Promise<void> {
    await this.files.mkdir(this.config.chainDatabasePath, { recursive: true })

    try {
      await this.chain.open(options)
      await this.accounts.open(options)
    } catch (e) {
      await this.chain.close()
      await this.accounts.close()
      throw e
    }
  }

  async closeDB(): Promise<void> {
    await this.chain.close()
    await this.accounts.close()
  }

  async start(): Promise<void> {
    this.shutdownPromise = new Promise((r) => (this.shutdownResolve = r))
    this.started = true

    // Work in the worker pool happens concurrently,
    // so we should start it as soon as possible
    this.workerPool.start()

    if (this.config.get('enableTelemetry')) {
      this.telemetry.start()
    }

    if (this.config.get('enableMetrics')) {
      this.metrics.start()
    }

    await this.accounts.start()
    this.peerNetwork.start()

    if (this.config.get('enableRpc')) {
      await this.rpc.start()
    }

    this.telemetry.submitNodeStarted()
  }

  async waitForShutdown(): Promise<void> {
    await this.shutdownPromise
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled([
      this.accounts.stop(),
      this.syncer.stop(),
      this.peerNetwork.stop(),
      this.rpc.stop(),
      this.telemetry.stop(),
      this.metrics.stop(),
      this.workerPool.stop(),
    ])

    if (this.shutdownResolve) {
      this.shutdownResolve()
    }

    this.started = false
  }

  onPeerNetworkReady(): void {
    if (this.config.get('enableSyncing')) {
      void this.syncer.start()
    }
  }

  onPeerNetworkNotReady(): void {
    void this.syncer.stop()
  }

  async onConfigChange<Key extends keyof ConfigOptions>(
    key: Key,
    newValue: ConfigOptions[Key],
  ): Promise<void> {
    switch (key) {
      case 'enableTelemetry': {
        if (newValue) {
          this.telemetry.start()
        } else {
          await this.telemetry.stop()
        }
        break
      }
      case 'enableMetrics': {
        if (newValue) {
          this.metrics.start()
        } else {
          this.metrics.stop()
        }
        break
      }
      case 'enableRpc': {
        if (newValue) {
          await this.rpc.start()
        } else {
          await this.rpc.stop()
        }
        break
      }
    }
  }
}
