/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Config,
  ConfigOptions,
  DEFAULT_DATA_DIR,
  InternalOptions,
  InternalStore,
} from './fileStores'
import { FileSystem, NodeFileProvider } from './fileSystems'
import {
  createRootLogger,
  Logger,
  setJSONLoggingFromConfig,
  setLogColorEnabledFromConfig,
  setLogLevelFromConfig,
  setLogPrefixFromConfig,
} from './logger'
import { FileReporter } from './logger/reporters'
import { MetricsMonitor } from './metrics'
import { PrivateIdentity } from './network/identity'
import { IsomorphicWebSocketConstructor } from './network/types'
import { WebSocketClient } from './network/webSocketClient'
import { FullNode } from './node'
import { IronfishPKG, Package } from './package'
import { Platform } from './platform'
import { RpcHttpAdapter, RpcSocketClient, RpcTlsAdapter } from './rpc'
import { RpcIpcAdapter } from './rpc/adapters/ipcAdapter'
import { RpcTcpAdapter } from './rpc/adapters/tcpAdapter'
import { RpcClient } from './rpc/clients/client'
import { RpcIpcClient } from './rpc/clients/ipcClient'
import { RpcMemoryClient } from './rpc/clients/memoryClient'
import { RpcTcpClient } from './rpc/clients/tcpClient'
import { RpcTlsClient } from './rpc/clients/tlsClient'
import { ALL_API_NAMESPACES, ApiNamespace } from './rpc/routes/router'
import { Strategy } from './strategy'
import { NodeUtils } from './utils'
import { WalletNode } from './walletNode'

export class IronfishSdk {
  pkg: Package
  client: RpcSocketClient
  config: Config
  fileSystem: FileSystem
  logger: Logger
  metrics: MetricsMonitor
  internal: InternalStore
  strategyClass: typeof Strategy | null
  dataDir: string

  private constructor(
    pkg: Package,
    client: RpcSocketClient,
    config: Config,
    internal: InternalStore,
    fileSystem: FileSystem,
    logger: Logger,
    metrics: MetricsMonitor,
    strategyClass: typeof Strategy | null = null,
    dataDir: string,
  ) {
    this.pkg = pkg
    this.client = client
    this.config = config
    this.internal = internal
    this.fileSystem = fileSystem
    this.logger = logger
    this.metrics = metrics
    this.strategyClass = strategyClass
    this.dataDir = dataDir
  }

  static async init({
    pkg,
    configName,
    configOverrides,
    internalOverrides,
    fileSystem,
    dataDir,
    logger = createRootLogger(),
    metrics,
    strategyClass,
  }: {
    pkg?: Package
    configName?: string
    configOverrides?: Partial<ConfigOptions>
    internalOverrides?: Partial<InternalOptions>
    fileSystem?: FileSystem
    dataDir?: string
    logger?: Logger
    metrics?: MetricsMonitor
    strategyClass?: typeof Strategy
  } = {}): Promise<IronfishSdk> {
    const runtime = Platform.getRuntime()

    if (!fileSystem) {
      if (runtime.type === 'node') {
        fileSystem = new NodeFileProvider()
        await fileSystem.init()
      } else {
        throw new Error(`No default fileSystem for ${String(runtime)}`)
      }
    }

    logger = logger.withTag('ironfishsdk')
    dataDir = dataDir || DEFAULT_DATA_DIR

    const config = new Config(fileSystem, dataDir, configName)
    await config.load()

    const internal = new InternalStore(fileSystem, dataDir)
    await internal.load()

    if (configOverrides) {
      Object.assign(config.overrides, configOverrides)
    }

    if (internalOverrides) {
      Object.assign(internal.overrides, internalOverrides)
    }

    // Update the logger settings
    const logLevel = config.get('logLevel')
    if (logLevel) {
      setLogLevelFromConfig(logLevel)
    }
    const logPrefix = config.get('logPrefix')
    if (logPrefix) {
      setLogPrefixFromConfig(logPrefix)
    }

    setLogColorEnabledFromConfig(true)

    setJSONLoggingFromConfig(config.get('jsonLogs'))

    const logFile = config.get('enableLogFile')

    if (logFile && fileSystem instanceof NodeFileProvider && fileSystem.path) {
      const path = fileSystem.path.join(config.dataDir, 'ironfish.log')
      const fileLogger = new FileReporter(fileSystem, path)
      logger.addReporter(fileLogger)
    }

    if (!metrics) {
      metrics = metrics || new MetricsMonitor({ logger })
    }

    let client: RpcSocketClient
    const rpcAuthToken = internal.get('rpcAuthToken')

    if (config.get('enableRpcTcp')) {
      if (config.get('enableRpcTls')) {
        client = new RpcTlsClient(
          config.get('rpcTcpHost'),
          config.get('rpcTcpPort'),
          logger,
          rpcAuthToken,
        )
      } else {
        client = new RpcTcpClient(config.get('rpcTcpHost'), config.get('rpcTcpPort'), logger)
      }
    } else {
      client = new RpcIpcClient(config.get('ipcPath'), logger)
    }

    return new IronfishSdk(
      pkg || IronfishPKG,
      client,
      config,
      internal,
      fileSystem,
      logger,
      metrics,
      strategyClass,
      dataDir,
    )
  }

  async node({
    autoSeed,
    privateIdentity,
  }: {
    autoSeed?: boolean
    privateIdentity?: PrivateIdentity
  } = {}): Promise<FullNode> {
    const webSocket = WebSocketClient as IsomorphicWebSocketConstructor

    const node = await FullNode.init({
      pkg: this.pkg,
      config: this.config,
      internal: this.internal,
      files: this.fileSystem,
      autoSeed: autoSeed,
      logger: this.logger,
      metrics: this.metrics,
      strategyClass: this.strategyClass,
      webSocket: webSocket,
      privateIdentity: privateIdentity,
      dataDir: this.dataDir,
    })

    if (this.config.get('enableRpcIpc')) {
      await node.rpc.mount(
        new RpcIpcAdapter(this.config.get('ipcPath'), this.logger, ALL_API_NAMESPACES),
      )
    }

    if (this.config.get('enableRpcHttp')) {
      await node.rpc.mount(
        new RpcHttpAdapter(
          this.config.get('rpcHttpHost'),
          this.config.get('rpcHttpPort'),
          this.logger,
          ALL_API_NAMESPACES,
        ),
      )
    }

    if (this.config.get('enableRpcTcp')) {
      if (this.config.get('enableRpcTls')) {
        await node.rpc.mount(
          new RpcTlsAdapter(
            this.config.get('rpcTcpHost'),
            this.config.get('rpcTcpPort'),
            this.fileSystem,
            this.config.get('tlsKeyPath'),
            this.config.get('tlsCertPath'),
            node,
            this.logger,
            ALL_API_NAMESPACES,
          ),
        )
      } else {
        await node.rpc.mount(
          new RpcTcpAdapter(
            this.config.get('rpcTcpHost'),
            this.config.get('rpcTcpPort'),
            this.logger,
            ALL_API_NAMESPACES,
          ),
        )
      }
    }

    return node
  }

  async connectRpc(forceLocal = false, forceRemote = false): Promise<RpcClient> {
    forceRemote = forceRemote || this.config.get('enableRpcTcp')

    if (!forceLocal) {
      if (forceRemote) {
        await this.client.connect()
        return this.client
      }

      const connected = await this.client.tryConnect()
      if (connected) {
        return this.client
      }
    }

    const node = await this.node()
    const clientMemory = new RpcMemoryClient(
      this.logger,
      node.rpc.getRouter(ALL_API_NAMESPACES),
    )
    await NodeUtils.waitForOpen(node)
    return clientMemory
  }

  async walletNode(
    options: { connectNodeClient: boolean } = { connectNodeClient: true },
  ): Promise<WalletNode> {
    let nodeClient: RpcSocketClient | null = null

    if (this.config.get('walletNodeTcpEnabled')) {
      if (this.config.get('walletNodeTlsEnabled')) {
        nodeClient = new RpcTlsClient(
          this.config.get('walletNodeTcpHost'),
          this.config.get('walletNodeTcpPort'),
          this.logger,
          this.config.get('walletNodeRpcAuthToken'),
        )
      } else {
        nodeClient = new RpcTcpClient(
          this.config.get('walletNodeTcpHost'),
          this.config.get('walletNodeTcpPort'),
          this.logger,
        )
      }
    } else if (this.config.get('walletNodeIpcEnabled')) {
      nodeClient = new RpcIpcClient(this.config.get('walletNodeIpcPath'), this.logger)
    } else if (options.connectNodeClient) {
      throw new Error(`Cannot start the wallet: no node connection configuration specified.

Use 'ironfish config:set' to connect to a node via TCP, TLS, or IPC.`)
    }

    const node = await WalletNode.init({
      pkg: this.pkg,
      config: this.config,
      internal: this.internal,
      files: this.fileSystem,
      logger: this.logger,
      metrics: this.metrics,
      strategyClass: this.strategyClass,
      dataDir: this.dataDir,
      nodeClient,
    })

    const namespaces = [
      ApiNamespace.config,
      ApiNamespace.rpc,
      ApiNamespace.wallet,
      ApiNamespace.worker,
    ]

    if (this.config.get('enableRpcIpc')) {
      await node.rpc.mount(
        new RpcIpcAdapter(this.config.get('ipcPath'), this.logger, namespaces),
      )
    }

    if (this.config.get('enableRpcHttp')) {
      await node.rpc.mount(
        new RpcHttpAdapter(
          this.config.get('rpcHttpHost'),
          this.config.get('rpcHttpPort'),
          this.logger,
          namespaces,
        ),
      )
    }

    if (this.config.get('enableRpcTcp')) {
      if (this.config.get('enableRpcTls')) {
        await node.rpc.mount(
          new RpcTlsAdapter(
            this.config.get('rpcTcpHost'),
            this.config.get('rpcTcpPort'),
            this.fileSystem,
            this.config.get('tlsKeyPath'),
            this.config.get('tlsCertPath'),
            node,
            this.logger,
            namespaces,
          ),
        )
      } else {
        await node.rpc.mount(
          new RpcTcpAdapter(
            this.config.get('rpcTcpHost'),
            this.config.get('rpcTcpPort'),
            this.logger,
            namespaces,
          ),
        )
      }
    }

    return node
  }

  async connectWalletRpc(
    options: {
      forceLocal?: boolean
      forceRemote?: boolean
      connectNodeClient?: boolean
    } = {
      forceLocal: false,
      forceRemote: false,
      connectNodeClient: false,
    },
  ): Promise<Pick<RpcClient, 'config' | 'rpc' | 'wallet' | 'worker'>> {
    const forceRemote = options.forceRemote || this.config.get('enableRpcTcp')

    if (!options.forceLocal) {
      if (forceRemote) {
        await this.client.connect()
        return this.client
      }

      const connected = await this.client.tryConnect()
      if (connected) {
        return this.client
      }
    }

    const namespaces = [
      ApiNamespace.config,
      ApiNamespace.rpc,
      ApiNamespace.wallet,
      ApiNamespace.worker,
    ]

    const node = await this.walletNode({ connectNodeClient: !!options.connectNodeClient })
    const clientMemory = new RpcMemoryClient(this.logger, node.rpc.getRouter(namespaces))
    await NodeUtils.waitForOpen(node)
    return clientMemory
  }
}
