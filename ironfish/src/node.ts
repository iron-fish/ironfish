/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import os from 'os'
import { Config, ConfigOptions, InternalStore } from './fileStores'
import { FileSystem } from './fileSystems'
import { IDatabase } from './storage'
import { IJSON } from './serde'
import { Blockchain, IronfishBlockchain } from './blockchain'
import { createRootLogger, Logger } from './logger'
import { genesisBlockData } from './genesis'
import { RpcServer } from './rpc/server'
import { MiningDirector } from './mining'
import { submitMetric, startCollecting, stopCollecting, setDefaultTags } from './telemetry'
import { MetricsMonitor } from './metrics'
import { Accounts, Account, AccountsDB } from './account'
import { IronfishMemPool, MemPool } from './memPool'
import { Assert } from './assert'
import { PeerNetwork } from './network'
import { IsomorphicWebRtc, IsomorphicWebSocketConstructor } from './network/types'
import { WorkerPool } from './workerPool'
import { BlockSyncer, IronfishBlockSyncer } from './blockSyncer'
import { createDB } from './storage/utils'
import { IronfishMiningDirector } from './mining/director'
import { IronfishStrategy } from './strategy'
import { IronfishVerifier } from './consensus/verifier'
import { IronfishBlock, SerializedBlock } from './primitives/block'

export class IronfishNode {
  database: IDatabase
  chain: IronfishBlockchain
  strategy: IronfishStrategy
  config: Config
  internal: InternalStore
  accounts: Accounts
  logger: Logger
  miningDirector: IronfishMiningDirector
  metrics: MetricsMonitor
  memPool: IronfishMemPool
  workerPool: WorkerPool
  files: FileSystem
  rpc: RpcServer
  peerNetwork: PeerNetwork
  syncer: IronfishBlockSyncer

  shutdownPromise: Promise<void> | null = null
  shutdownResolve: (() => void) | null = null

  private constructor({
    agent,
    chain,
    database,
    files,
    config,
    internal,
    accounts,
    strategy,
    metrics,
    miningDirector,
    memPool,
    workerPool,
    logger,
    webRtc,
    webSocket,
  }: {
    agent: string
    database: IDatabase
    files: FileSystem
    config: Config
    internal: InternalStore
    accounts: Accounts
    chain: IronfishBlockchain
    strategy: IronfishStrategy
    metrics: MetricsMonitor
    miningDirector: IronfishMiningDirector
    memPool: IronfishMemPool
    workerPool: WorkerPool
    logger: Logger
    webRtc?: IsomorphicWebRtc
    webSocket: IsomorphicWebSocketConstructor
  }) {
    this.database = database
    this.files = files
    this.config = config
    this.internal = internal
    this.accounts = accounts
    this.chain = chain
    this.strategy = strategy
    this.metrics = metrics
    this.miningDirector = miningDirector
    this.memPool = memPool
    this.workerPool = workerPool
    this.rpc = new RpcServer(this)
    this.logger = logger

    this.peerNetwork = new PeerNetwork({
      agent: agent,
      port: config.get('peerPort'),
      name: config.get('nodeName'),
      maxPeers: config.get('maxPeers'),
      minPeers: config.get('minPeers'),
      listen: config.get('enableListenP2P'),
      targetPeers: config.get('targetPeers'),
      isWorker: config.get('isWorker'),
      broadcastWorkers: config.get('broadcastWorkers'),
      simulateLatency: config.get('p2pSimulateLatency'),
      bootstrapNodes: config.getArray('bootstrapNodes'),
      webSocket: webSocket,
      webRtc: webRtc,
      node: this,
      chain: chain,
      strategy: strategy,
    })

    this.syncer = new BlockSyncer({
      chain: chain,
      metrics: metrics,
      logger: logger,
      strategy: strategy,
      peerNetwork: this.peerNetwork,
    })

    this.config.onConfigChange.on((key, value) => this.onConfigChange(key, value))
    this.accounts.onDefaultAccountChange.on(this.onDefaultAccountChange)
  }

  static async init({
    agent,
    databaseName,
    dataDir,
    config,
    internal,
    logger = createRootLogger(),
    metrics,
    files,
    verifierClass,
    strategyClass,
    webRtc,
    webSocket,
  }: {
    agent: string
    dataDir?: string
    config?: Config
    internal?: InternalStore
    databaseName?: string
    logger?: Logger
    metrics?: MetricsMonitor
    files: FileSystem
    verifierClass: typeof IronfishVerifier | null
    strategyClass: typeof IronfishStrategy | null
    webRtc?: IsomorphicWebRtc
    webSocket: IsomorphicWebSocketConstructor
  }): Promise<IronfishNode> {
    logger = logger.withTag('ironfishnode')
    metrics = metrics || new MetricsMonitor(logger)

    if (!config) {
      config = new Config(files, dataDir)
      await config.load()
    }

    if (!internal) {
      internal = new InternalStore(files, dataDir)
      await internal.load()
    }

    if (databaseName) {
      config.setOverride('databaseName', databaseName)
    }

    const workerPool = new WorkerPool()

    strategyClass = strategyClass || IronfishStrategy
    const strategy = new strategyClass(workerPool, verifierClass)

    const chaindb = createDB({ location: config.chainDatabasePath })
    const chain = await Blockchain.new(chaindb, strategy, logger, metrics)

    const memPool = new MemPool({ chain: chain, strategy: strategy, logger: logger })

    const accountDB = new AccountsDB({
      location: config.accountDatabasePath,
      workerPool,
      files,
    })

    const accounts = new Accounts({ database: accountDB, workerPool: workerPool, chain: chain })

    const mining = new MiningDirector({
      chain: chain,
      strategy: strategy,
      memPool: memPool,
      logger: logger,
      graffiti: config.get('blockGraffiti'),
    })

    const anonymousTelemetryId = Math.random().toString().substring(2)
    setDefaultTags({ version: agent, sessionId: anonymousTelemetryId })

    return new IronfishNode({
      agent,
      database: chaindb,
      chain,
      strategy,
      files,
      config,
      internal,
      accounts,
      metrics,
      miningDirector: mining,
      memPool,
      workerPool,
      logger,
      webRtc,
      webSocket,
    })
  }

  async openDB(): Promise<void> {
    await this.files.mkdir(this.config.chainDatabasePath, { recursive: true })

    try {
      await this.database.open()
      await this.accounts.db.open()
    } catch (e) {
      await this.database.close()
      await this.accounts.db.close()
      throw e
    }

    await this.accounts.load()

    const defaultAccount = this.accounts.getDefaultAccount()
    this.miningDirector.setMinerAccount(defaultAccount)
  }

  async closeDB(): Promise<void> {
    await this.database.close()
    await this.accounts.db.close()
  }

  async start(): Promise<void> {
    this.shutdownPromise = new Promise((r) => (this.shutdownResolve = r))

    // Work in the worker pool happens concurrently,
    // so we should start it as soon as possible
    this.workerPool.start(os.cpus().length)

    if (this.config.get('enableTelemetry')) {
      startCollecting(this.config.get('telemetryApi'))
    }

    if (this.config.get('enableMetrics')) {
      this.metrics.start()
    }

    this.accounts.start()
    this.peerNetwork.start()

    if (this.config.get('enableRpc')) {
      await this.rpc.start()
    }

    submitMetric({
      name: 'started',
      fields: [{ name: 'online', type: 'boolean', value: true }],
    })
  }

  async waitForShutdown(): Promise<void> {
    await this.shutdownPromise
  }

  async shutdown(): Promise<void> {
    await Promise.all([
      this.accounts.stop(),
      this.syncer.shutdown(),
      this.peerNetwork.stop(),
      this.rpc.stop(),
      stopCollecting(),
      this.metrics.stop(),
      this.workerPool.stop(),
      this.miningDirector.shutdown(),
    ])

    if (this.shutdownResolve) this.shutdownResolve()
  }

  async seed(): Promise<IronfishBlock> {
    const serialized = IJSON.parse(genesisBlockData) as SerializedBlock<Buffer, Buffer>
    const block = this.strategy.blockSerde.deserialize(serialized)
    const result = await this.chain.addBlock(block)
    Assert.isTrue(result.isAdded, `Could not seed genesis: ${result.reason || 'unknown'}`)
    return block
  }

  onPeerNetworkReady(): void {
    void this.syncer.start()

    if (this.config.get('enableMiningDirector')) {
      void this.miningDirector.start()
    }
  }

  onPeerNetworkNotReady(): void {
    void this.syncer.shutdown()

    if (this.config.get('enableMiningDirector')) {
      this.miningDirector.shutdown()
    }
  }

  onDefaultAccountChange = (account: Account | null): void => {
    this.miningDirector.setMinerAccount(account)
  }

  async onConfigChange<Key extends keyof ConfigOptions>(
    key: Key,
    newValue: ConfigOptions[Key],
  ): Promise<void> {
    switch (key) {
      case 'blockGraffiti': {
        this.miningDirector.setBlockGraffiti(this.config.get('blockGraffiti'))
        break
      }
      case 'enableTelemetry': {
        if (newValue) startCollecting(this.config.get('telemetryApi'))
        else await stopCollecting()
        break
      }
      case 'enableMetrics': {
        if (newValue) this.metrics.start()
        else this.metrics.stop()
        break
      }
      case 'enableRpc': {
        if (newValue) await this.rpc.start()
        else await this.rpc.stop()
        break
      }
      case 'enableMiningDirector': {
        if (newValue && this.peerNetwork.isReady) {
          void this.miningDirector.start()
        } else {
          this.miningDirector.shutdown()
        }
        break
      }
    }
  }
}
