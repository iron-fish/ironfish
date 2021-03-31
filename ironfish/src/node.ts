/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Config, ConfigOptions, InternalStore } from './fileStores'
import { FileSystem } from './fileSystems'
import { IDatabase } from './storage'
import { IJSON } from './serde'
import {
  IronfishCaptain,
  IronfishMiningDirector,
  IronfishStrategy,
  IronfishMemPool,
  IronfishVerifier,
} from './strategy'
import { NetworkBridge } from './networkBridge'
import Captain, { SerializedBlock } from './captain'
import { createRootLogger, Logger } from './logger'
import { genesisBlockData } from './genesis'
import { RpcServer } from './rpc/server'
import { MiningDirector } from './mining'
import { submitMetric, startCollecting, stopCollecting } from './telemetry'
import { MetricsMonitor } from './metrics'
import { AsyncTransactionWorkerPool } from './strategy/asyncTransactionWorkerPool'
import { Accounts, Account, AccountsDB } from './account'
import { MemPool } from './memPool'

export class IronfishNode {
  database: IDatabase
  captain: IronfishCaptain
  strategy: IronfishStrategy
  config: Config
  internal: InternalStore
  networkBridge: NetworkBridge
  accounts: Accounts
  logger: Logger
  miningDirector: IronfishMiningDirector
  metrics: MetricsMonitor
  memPool: IronfishMemPool
  shutdownPromise: Promise<void> | null = null
  shutdownResolve: (() => void) | null = null
  files: FileSystem
  rpc: RpcServer

  private constructor({
    database,
    files,
    config,
    internal,
    accounts,
    captain,
    strategy,
    metrics,
    miningDirector,
    memPool,
    logger,
  }: {
    database: IDatabase
    files: FileSystem
    config: Config
    internal: InternalStore
    accounts: Accounts
    captain: IronfishCaptain
    strategy: IronfishStrategy
    metrics: MetricsMonitor
    miningDirector: IronfishMiningDirector
    memPool: IronfishMemPool
    logger: Logger
  }) {
    this.database = database
    this.files = files
    this.config = config
    this.internal = internal
    this.accounts = accounts
    this.networkBridge = new NetworkBridge()
    this.captain = captain
    this.strategy = strategy
    this.metrics = metrics
    this.miningDirector = miningDirector
    this.memPool = memPool
    this.rpc = new RpcServer(this)
    this.logger = logger

    this.networkBridge.attachNode(this)
    this.config.onConfigChange.on((key, value) => this.onConfigChange(key, value))
    this.accounts.onDefaultAccountChange.on(this.onDefaultAccountChange)
  }

  static async init({
    databaseName,
    dataDir,
    config,
    internal,
    logger = createRootLogger(),
    metrics,
    makeDatabase,
    files,
    verifierClass,
    strategyClass,
  }: {
    dataDir?: string
    config?: Config
    internal?: InternalStore
    databaseName?: string
    logger?: Logger
    metrics?: MetricsMonitor
    makeDatabase: (path: string) => Promise<IDatabase>
    files: FileSystem
    verifierClass: typeof IronfishVerifier | null
    strategyClass: typeof IronfishStrategy | null
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

    const chainDatabasePath = files.join(
      config.storage.dataDir,
      'databases',
      config.get('databaseName'),
    )

    const chainDatabase = await makeDatabase(chainDatabasePath)

    strategyClass = strategyClass || IronfishStrategy
    const strategy = new strategyClass(verifierClass)

    const captain = await Captain.new(chainDatabase, strategy, undefined, undefined, metrics)
    const memPool = new MemPool(captain, logger)

    const accountDatabasePath = files.join(
      config.storage.dataDir,
      'accounts',
      config.get('accountName'),
    )

    const accountDatabase = await makeDatabase(accountDatabasePath)
    const accountDB = new AccountsDB({ database: accountDatabase })
    const accounts = new Accounts({ database: accountDB })

    const miningDirector = new MiningDirector(captain, memPool, logger)
    miningDirector.setBlockGraffiti(config.get('blockGraffiti'))

    return new IronfishNode({
      database: chainDatabase,
      captain,
      strategy,
      files,
      config,
      internal,
      accounts,
      metrics,
      miningDirector,
      memPool,
      logger,
    })
  }

  async openDB(): Promise<void> {
    try {
      await this.database.open()
      await this.accounts.database.open()
    } catch (e) {
      await this.database.close()
      await this.accounts.database.close()
      throw e
    }

    await this.accounts.load()

    const defaultAccount = this.accounts.getDefaultAccount()
    this.miningDirector.setMinerAccount(defaultAccount)
  }

  async closeDB(): Promise<void> {
    await this.database.close()
    await this.accounts.database.close()
  }

  async start(): Promise<void> {
    this.shutdownPromise = new Promise((r) => (this.shutdownResolve = r))

    // Work in the transaction pool happens concurrently,
    // so we should start it as soon as possible
    AsyncTransactionWorkerPool.start()

    if (this.config.get('enableTelemetry')) {
      startCollecting(this.config.get('telemetryApi'))
    }

    if (this.config.get('enableMetrics')) {
      this.metrics.start()
    }

    this.accounts.start(this)

    const promises = [this.captain.start()]

    if (this.config.get('enableRpc')) {
      promises.push(this.rpc.start())
    }

    await Promise.all(promises)

    submitMetric({
      name: 'started',
      fields: [{ name: 'online', type: 'boolean', value: true }],
    })

    // this.captain.blockSyncer.onTreesSynced.on((treesSynced) => {
    //   if (treesSynced) {
    //     this.onTreesSynced()
    //   } else {
    //     this.onTreesOutOfSync()
    //   }
    // })
  }

  async waitForShutdown(): Promise<void> {
    await this.shutdownPromise
  }

  async shutdown(): Promise<void> {
    await Promise.all([
      this.accounts.stop(),
      this.captain.shutdown(),
      this.rpc.stop(),
      stopCollecting(),
      this.metrics.stop(),
      AsyncTransactionWorkerPool.stop(),
      this.miningDirector.shutdown(),
    ])

    if (this.shutdownResolve) this.shutdownResolve()
  }

  async seed(): Promise<boolean> {
    const result = IJSON.parse(genesisBlockData) as SerializedBlock<Buffer, Buffer>
    const block = this.strategy._blockSerde.deserialize(result)
    const blockAddedResult = await this.captain.chain.addBlock(block)
    return blockAddedResult.isAdded
  }

  onPeerNetworkReady(): void {
    this.captain.onPeerNetworkReady()

    // this.captain.blockSyncer.treesSynced &&
    if (this.config.get('enableMiningDirector')) {
      void this.miningDirector.start()
    }
  }

  onPeerNetworkNotReady(): void {
    this.captain.onPeerNetworkNotReady()

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
        if (newValue && this.networkBridge.peerNetwork?.isReady)
          void this.miningDirector.start()
        else this.miningDirector.shutdown()
        break
      }
    }
  }
}
