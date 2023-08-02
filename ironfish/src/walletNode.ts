/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { AssetsVerifier } from './assets'
import { TestnetConsensus } from './consensus'
import {
  Config,
  ConfigOptions,
  DEFAULT_DATA_DIR,
  HostsStore,
  InternalStore,
  VerifiedAssetsCacheStore,
} from './fileStores'
import { FileSystem } from './fileSystems'
import { createRootLogger, Logger } from './logger'
import { MetricsMonitor } from './metrics'
import { Migrator } from './migrations'
import { Database } from './migrations/migration'
import { getNetworkDefinition } from './networkDefinition'
import { Package } from './package'
import { RpcClient } from './rpc'
import { RpcServer } from './rpc/server'
import { Strategy } from './strategy'
import { Wallet, WalletDB } from './wallet'
import { calculateWorkers, WorkerPool } from './workerPool'

export class WalletNode {
  strategy: Strategy
  config: Config
  internal: InternalStore
  wallet: Wallet
  logger: Logger
  metrics: MetricsMonitor
  migrator: Migrator
  workerPool: WorkerPool
  files: FileSystem
  rpc: RpcServer
  pkg: Package
  assetsVerifier: AssetsVerifier

  started = false
  shutdownPromise: Promise<void> | null = null
  shutdownResolve: (() => void) | null = null

  constructor({
    pkg,
    files,
    config,
    internal,
    wallet,
    strategy,
    metrics,
    workerPool,
    logger,
    assetsVerifier,
  }: {
    pkg: Package
    files: FileSystem
    config: Config
    internal: InternalStore
    wallet: Wallet
    strategy: Strategy
    metrics: MetricsMonitor
    workerPool: WorkerPool
    logger: Logger
    assetsVerifier: AssetsVerifier
  }) {
    this.files = files
    this.config = config
    this.internal = internal
    this.wallet = wallet
    this.strategy = strategy
    this.metrics = metrics
    this.workerPool = workerPool
    this.rpc = new RpcServer(this, internal)
    this.logger = logger
    this.pkg = pkg

    this.migrator = new Migrator({ node: this, logger, databases: [Database.WALLET] })

    this.assetsVerifier = assetsVerifier

    this.config.onConfigChange.on((key, value) => this.onConfigChange(key, value))
  }

  static async init({
    pkg: pkg,
    dataDir,
    config,
    internal,
    logger = createRootLogger(),
    metrics,
    files,
    strategyClass,
    nodeClient,
  }: {
    pkg: Package
    dataDir?: string
    config?: Config
    internal?: InternalStore
    logger?: Logger
    metrics?: MetricsMonitor
    files: FileSystem
    strategyClass: typeof Strategy | null
    nodeClient: RpcClient
  }): Promise<WalletNode> {
    logger = logger.withTag('walletnode')
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

    const verifiedAssetsCache = new VerifiedAssetsCacheStore(files, dataDir)
    await verifiedAssetsCache.load()

    const assetsVerifier = new AssetsVerifier({
      apiUrl: config.get('assetVerificationApi'),
      cache: verifiedAssetsCache,
      logger,
    })

    const numWorkers = calculateWorkers(config.get('nodeWorkers'), config.get('nodeWorkersMax'))

    const workerPool = new WorkerPool({ metrics, numWorkers })

    metrics = metrics || new MetricsMonitor({ logger })

    const networkDefinition = await getNetworkDefinition(config, internal, files)

    const consensus = new TestnetConsensus(networkDefinition.consensus)

    strategyClass = strategyClass || Strategy
    const strategy = new strategyClass({ workerPool, consensus })

    const walletDB = new WalletDB({
      location: config.walletDatabasePath,
      workerPool,
      files,
    })

    const wallet = new Wallet({
      config,
      database: walletDB,
      workerPool,
      consensus,
      nodeClient,
      assetsVerifier,
    })

    const node = new WalletNode({
      pkg,
      strategy,
      files,
      config,
      internal,
      wallet,
      metrics,
      workerPool,
      logger,
      assetsVerifier,
    })

    return node
  }

  async openDB(): Promise<void> {
    const migrate = this.config.get('databaseMigrate')
    const initial = await this.migrator.isInitial()

    if (migrate || initial) {
      await this.migrator.migrate({
        quiet: !migrate,
        quietNoop: true,
      })
    }

    try {
      await this.wallet.open()
    } catch (e) {
      await this.wallet.close()
      throw e
    }
  }

  async closeDB(): Promise<void> {
    await this.wallet.close()
  }

  async start(): Promise<void> {
    this.shutdownPromise = new Promise((r) => (this.shutdownResolve = r))
    this.started = true

    // Work in the worker pool happens concurrently,
    // so we should start it as soon as possible
    this.workerPool.start()

    if (this.config.get('enableMetrics')) {
      this.metrics.start()
    }

    await this.wallet.start()

    if (this.config.get('enableRpc')) {
      await this.rpc.start()
    }

    if (this.config.get('enableAssetVerification')) {
      this.assetsVerifier.start()
    }
  }

  async waitForShutdown(): Promise<void> {
    await this.shutdownPromise
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled([
      this.wallet.stop(),
      this.rpc.stop(),
      this.assetsVerifier.stop(),
      this.metrics.stop(),
    ])

    // Do after to avoid unhandled error from aborted jobs
    await Promise.allSettled([this.workerPool.stop()])

    if (this.shutdownResolve) {
      this.shutdownResolve()
    }

    this.started = false
  }

  async onConfigChange<Key extends keyof ConfigOptions>(
    key: Key,
    newValue: ConfigOptions[Key],
  ): Promise<void> {
    switch (key) {
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
      case 'enableAssetVerification': {
        if (newValue) {
          this.assetsVerifier.start()
        } else {
          this.assetsVerifier.stop()
        }
        break
      }
    }
  }
}
