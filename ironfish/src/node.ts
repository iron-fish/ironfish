/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BoxKeyPair, FishHashContext } from '@ironfish/rust-nodejs'
import { v4 as uuid } from 'uuid'
import { AssetsVerifier, getDefaultAssetVerificationEndpoint } from './assets'
import { Blockchain } from './blockchain'
import { BlockHasher } from './blockHasher'
import {
  Config,
  DEFAULT_DATA_DIR,
  InternalStore,
  PeerStore,
  VerifiedAssetsCacheStore,
} from './fileStores'
import { FileSystem } from './fileSystems'
import { createRootLogger, Logger } from './logger'
import { MemPool } from './memPool'
import { FeeEstimator } from './memPool/feeEstimator'
import { MetricsMonitor } from './metrics'
import { Migrator } from './migrations'
import { MiningManager } from './mining'
import { PeerNetwork, PrivateIdentity, privateIdentityToIdentity } from './network'
import { isHexSecretKey } from './network/identity'
import { IsomorphicWebSocketConstructor } from './network/types'
import { getNetworkDefinition } from './networks'
import { Network } from './networks/network'
import { Package } from './package'
import { Platform } from './platform'
import { ALL_API_NAMESPACES, RpcMemoryClient } from './rpc'
import { RpcServer } from './rpc/server'
import { Syncer } from './syncer'
import { Telemetry } from './telemetry/telemetry'
import { Wallet, WalletDB } from './wallet'
import { calculateWorkers, WorkerPool } from './workerPool'

export class FullNode {
  chain: Blockchain
  config: Config
  internal: InternalStore
  wallet: Wallet
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
  assetsVerifier: AssetsVerifier
  network: Network

  started = false
  shutdownPromise: Promise<void> | null = null
  shutdownResolve: (() => void) | null = null

  constructor({
    pkg,
    chain,
    files,
    config,
    internal,
    wallet,
    metrics,
    memPool,
    workerPool,
    logger,
    webSocket,
    privateIdentity,
    peerStore,
    assetsVerifier,
    network,
  }: {
    pkg: Package
    files: FileSystem
    config: Config
    internal: InternalStore
    wallet: Wallet
    chain: Blockchain
    metrics: MetricsMonitor
    memPool: MemPool
    workerPool: WorkerPool
    logger: Logger
    webSocket: IsomorphicWebSocketConstructor
    privateIdentity: PrivateIdentity
    peerStore: PeerStore
    assetsVerifier: AssetsVerifier
    network: Network
  }) {
    this.files = files
    this.config = config
    this.internal = internal
    this.wallet = wallet
    this.chain = chain
    this.metrics = metrics
    this.network = network
    this.miningManager = new MiningManager({
      chain,
      memPool,
      node: this,
      metrics,
      preemptiveBlockMining: config.get('preemptiveBlockMining'),
    })
    this.memPool = memPool
    this.workerPool = workerPool
    this.rpc = new RpcServer(this, internal)
    this.logger = logger
    this.pkg = pkg

    this.migrator = new Migrator({ context: this, logger })

    this.telemetry = new Telemetry({
      chain,
      logger,
      config,
      metrics,
      workerPool,
      localPeerIdentity: privateIdentityToIdentity(privateIdentity),
      defaultTags: [
        { name: 'version', value: pkg.version },
        { name: 'agent', value: Platform.getAgent(pkg) },
      ],
      defaultFields: [
        { name: 'node_id', type: 'string', value: internal.get('telemetryNodeId') },
        { name: 'session_id', type: 'string', value: uuid() },
      ],
      networkId: network.id,
    })

    this.peerNetwork = new PeerNetwork({
      networkId: network.id,
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
      bootstrapNodes: config.getArray('bootstrapNodes'),
      stunServers: config.getArray('p2pStunServers'),
      webSocket: webSocket,
      node: this,
      chain: chain,
      metrics: this.metrics,
      peerStore: peerStore,
      logger: logger,
      telemetry: this.telemetry,
      incomingWebSocketWhitelist: config.getArray('incomingWebSocketWhitelist'),
      keepOpenPeerSlot: config.get('keepOpenPeerSlot'),
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
      blocksPerMessage: config.get('blocksPerMessage'),
    })

    this.assetsVerifier = assetsVerifier

    this.config.onConfigChange.on((key, value) => this.onConfigChange(key, value))
  }

  static async init({
    pkg: pkg,
    dataDir,
    config,
    internal,
    autoSeed,
    logger = createRootLogger(),
    metrics,
    files,
    webSocket,
    privateIdentity,
    fishHashContext,
    customNetworkPath,
    networkId,
  }: {
    pkg: Package
    dataDir?: string
    config?: Config
    internal?: InternalStore
    autoSeed?: boolean
    logger?: Logger
    metrics?: MetricsMonitor
    files: FileSystem
    webSocket: IsomorphicWebSocketConstructor
    privateIdentity?: PrivateIdentity
    fishHashContext?: FishHashContext
    customNetworkPath?: string
    networkId?: number
  }): Promise<FullNode> {
    logger = logger.withTag('ironfishnode')
    dataDir = dataDir || DEFAULT_DATA_DIR

    if (!config) {
      config = new Config(files, dataDir, {})
      await config.load()
    }

    if (!internal) {
      internal = new InternalStore(files, dataDir)
      await internal.load()
    }

    const peerStore = new PeerStore(files, dataDir)
    await peerStore.load()

    const numWorkers = calculateWorkers(config.get('nodeWorkers'), config.get('nodeWorkersMax'))

    const workerPool = new WorkerPool({ logger, metrics, numWorkers })

    metrics = metrics || new MetricsMonitor({ logger })

    const networkDefinition = await getNetworkDefinition(
      config,
      internal,
      files,
      customNetworkPath,
      networkId,
    )

    const network = new Network(networkDefinition)

    const verifiedAssetsCache = new VerifiedAssetsCacheStore(files, dataDir)
    await verifiedAssetsCache.load()

    const assetsVerifier = new AssetsVerifier({
      files,
      apiUrl:
        config.get('assetVerificationApi') || getDefaultAssetVerificationEndpoint(network.id),
      cache: verifiedAssetsCache,
      logger,
    })

    if (!config.isSet('bootstrapNodes')) {
      config.setOverride('bootstrapNodes', network.bootstrapNodes)
    }

    if (config.get('generateNewIdentity')) {
      privateIdentity = new BoxKeyPair()
    } else if (!privateIdentity) {
      const internalNetworkIdentity = internal.get('networkIdentity')
      privateIdentity = isHexSecretKey(internalNetworkIdentity)
        ? BoxKeyPair.fromHex(internalNetworkIdentity)
        : new BoxKeyPair()
    }
    internal.set('networkIdentity', privateIdentity.secretKey.toString('hex'))
    await internal.save()

    if (network.consensus.isNeverActive('enableFishHash')) {
      fishHashContext = undefined
    } else if (!fishHashContext) {
      const isFull = config.get('fishHashFullContext')
      fishHashContext = new FishHashContext(isFull)
    }

    const blockHasher = new BlockHasher({
      consensus: network.consensus,
      context: fishHashContext,
    })

    const chain = new Blockchain({
      location: config.chainDatabasePath,
      logger,
      metrics,
      autoSeed,
      workerPool,
      files,
      consensus: network.consensus,
      genesis: network.genesis,
      config,
      blockHasher,
      network,
    })

    const feeEstimator = new FeeEstimator({
      consensus: network.consensus,
      maxBlockHistory: config.get('feeEstimatorMaxBlockHistory'),
      percentiles: {
        slow: config.get('feeEstimatorPercentileSlow'),
        average: config.get('feeEstimatorPercentileAverage'),
        fast: config.get('feeEstimatorPercentileFast'),
      },
      logger,
    })

    const memPool = new MemPool({
      chain,
      feeEstimator,
      metrics,
      logger,
      consensus: network.consensus,
      maxSizeBytes: config.get('memPoolMaxSizeBytes'),
      recentlyEvictedCacheSize: config.get('memPoolRecentlyEvictedCacheSize'),
    })

    const walletDB = new WalletDB({
      location: config.walletDatabasePath,
      workerPool,
      files,
    })

    const memoryClient = new RpcMemoryClient(logger)

    const wallet = new Wallet({
      config,
      database: walletDB,
      workerPool,
      consensus: network.consensus,
      networkId: network.id,
      nodeClient: memoryClient,
      logger,
      chain,
    })

    const node = new FullNode({
      pkg,
      chain,
      files,
      config,
      internal,
      wallet,
      metrics,
      memPool,
      workerPool,
      logger,
      webSocket,
      privateIdentity,
      peerStore,
      assetsVerifier,
      network,
    })

    memoryClient.router = node.rpc.getRouter(ALL_API_NAMESPACES)

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
      await this.chain.open()
      await this.wallet.open()
    } catch (e) {
      await this.chain.close()
      await this.wallet.close()
      throw e
    }
  }

  async closeDB(): Promise<void> {
    await this.chain.close()
    await this.wallet.close()
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

    if (this.config.get('enableWallet')) {
      this.wallet.start()
    }

    this.peerNetwork.start()

    if (this.config.get('enableRpc')) {
      await this.rpc.start()
    }

    await this.memPool.start()

    if (this.config.get('enableAssetVerification')) {
      this.assetsVerifier.start()
    }

    this.telemetry.submitNodeStarted()
  }

  async waitForShutdown(): Promise<void> {
    await this.shutdownPromise
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled([
      this.wallet.stop(),
      this.syncer.stop(),
      this.peerNetwork.stop(),
      this.rpc.stop(),
      this.assetsVerifier.stop(),
      this.telemetry.stop(),
      this.metrics.stop(),
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

  async onConfigChange(key: string, newValue: unknown): Promise<void> {
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
      case 'enableWallet': {
        if (newValue) {
          this.wallet.start()
        } else {
          await this.wallet.stop()
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
