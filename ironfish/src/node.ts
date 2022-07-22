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
import { MinedBlocksIndexer } from './indexers/minedBlocksIndexer'
import { createRootLogger, Logger } from './logger'
import { MemPool } from './memPool'
import { MetricsMonitor } from './metrics'
import { Migrator } from './migrations'
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
  migrator: Migrator
  workerPool: WorkerPool
  files: FileSystem
  rpc: RpcServer
  peerNetwork: PeerNetwork
  syncer: Syncer
  pkg: Package
  telemetry: Telemetry
  minedBlocksIndexer: MinedBlocksIndexer

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
    privateIdentity,
    hostsStore,
    minedBlocksIndexer,
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
    privateIdentity?: PrivateIdentity
    hostsStore: HostsStore
    minedBlocksIndexer: MinedBlocksIndexer
  }) {
    this.files = files
    this.config = config
    this.internal = internal
    this.accounts = accounts
    this.chain = chain
    this.strategy = strategy
    this.metrics = metrics
    this.miningManager = new MiningManager({ chain, memPool, node: this })
    this.memPool = memPool
    this.workerPool = workerPool
    this.rpc = new RpcServer(this)
    this.logger = logger
    this.pkg = pkg
    this.minedBlocksIndexer = minedBlocksIndexer

    this.migrator = new Migrator({ node: this, logger })

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
      logger: logger,
    })

    this.telemetry = new Telemetry({
      chain,
      logger,
      config,
      metrics,
      workerPool,
      localPeerIdentity: this.peerNetwork.localPeer.publicIdentity,
      defaultTags: [{ name: 'version', value: pkg.version }],
      defaultFields: [
        { name: 'node_id', type: 'string', value: internal.get('telemetryNodeId') },
        { name: 'session_id', type: 'string', value: uuid() },
      ],
    })

    this.miningManager.onNewBlock.on((block) => {
      this.telemetry.submitBlockMined(block)
    })

    this.peerNetwork.onTransactionAccepted.on((transaction, received) => {
      this.telemetry.submitNewTransactionSeen(transaction, received)
    })

    this.syncer = new Syncer({
      chain,
      metrics,
      logger,
      telemetry: this.telemetry,
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
      files,
    })

    const memPool = new MemPool({ chain, metrics, logger })

    const accountDB = new AccountsDB({
      location: config.accountDatabasePath,
      workerPool,
      files,
    })

    const accounts = new Accounts({
      chain,
      config,
      database: accountDB,
      workerPool,
    })

    const minedBlocksIndexer = new MinedBlocksIndexer({
      files,
      location: config.indexDatabasePath,
      accounts,
      chain,
      logger,
    })

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
      privateIdentity,
      hostsStore,
      minedBlocksIndexer,
    })
  }

  async openDB(): Promise<void> {
    const migrate = this.config.get('databaseMigrate')
    const initial = await this.migrator.isInitial()

    if (migrate || initial) {
      await this.migrator.migrate({ quiet: !migrate, quietNoop: true })
    }

    try {
      await this.chain.open()
      await this.accounts.open()
      await this.minedBlocksIndexer.open()
    } catch (e) {
      await this.chain.close()
      await this.accounts.close()
      await this.minedBlocksIndexer.close()
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

    await this.minedBlocksIndexer.start()
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
      this.minedBlocksIndexer.stop(),
    ])

    // Do after to avoid unhandled error from aborted jobs
    await Promise.allSettled([this.workerPool.stop()])

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
