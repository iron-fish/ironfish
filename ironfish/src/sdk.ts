/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BoxKeyPair } from 'tweetnacl'
import { Config, ConfigOptions, InternalStore } from './fileStores'
import { FileSystem, NodeFileProvider } from './fileSystems'
import {
  createRootLogger,
  Logger,
  setLogColorEnabledFromConfig,
  setLogLevelFromConfig,
  setLogPrefixFromConfig,
} from './logger'
import { FileReporter } from './logger/reporters'
import { MetricsMonitor } from './metrics'
import { PrivateIdentity } from './network/identity'
import { IsomorphicWebSocketConstructor } from './network/types'
import { IronfishNode } from './node'
import { IronfishPKG, Package } from './package'
import { Platform } from './platform'
import { IpcAdapter } from './rpc/adapters/ipcAdapter'
import { IronfishIpcClient } from './rpc/clients/ipcClient'
import { IronfishMemoryClient } from './rpc/clients/memoryClient'
import { IronfishRpcClient } from './rpc/clients/rpcClient'
import { ApiNamespace } from './rpc/routes/router'
import { Strategy } from './strategy'
import { NodeUtils } from './utils'

export class IronfishSdk {
  pkg: Package
  client: IronfishIpcClient
  clientMemory: IronfishMemoryClient
  config: Config
  fileSystem: FileSystem
  logger: Logger
  metrics: MetricsMonitor
  internal: InternalStore
  strategyClass: typeof Strategy | null
  privateIdentity: BoxKeyPair | null | undefined
  dataDir?: string

  private constructor(
    pkg: Package,
    client: IronfishIpcClient,
    clientMemory: IronfishMemoryClient,
    config: Config,
    internal: InternalStore,
    fileSystem: FileSystem,
    logger: Logger,
    metrics: MetricsMonitor,
    strategyClass: typeof Strategy | null = null,
    dataDir?: string,
  ) {
    this.pkg = pkg
    this.client = client
    this.clientMemory = clientMemory
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
    fileSystem,
    dataDir,
    logger = createRootLogger(),
    metrics,
    strategyClass,
  }: {
    pkg?: Package
    configName?: string
    configOverrides?: Partial<ConfigOptions>
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

    const config = new Config(fileSystem, dataDir, configName)
    await config.load()

    const internal = new InternalStore(fileSystem, dataDir)
    await internal.load()

    if (configOverrides) {
      Object.assign(config.overrides, configOverrides)
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

    const logFile = config.get('enableLogFile')

    if (logFile && fileSystem instanceof NodeFileProvider && fileSystem.path) {
      const path = fileSystem.path.join(config.dataDir, 'ironfish.log')
      const fileLogger = new FileReporter(fileSystem, path)
      logger.addReporter(fileLogger)
    }

    if (!metrics) {
      metrics = metrics || new MetricsMonitor({ logger })
    }

    const client = new IronfishIpcClient(
      config.get('enableRpcTcp')
        ? {
            mode: 'tcp',
            host: config.get('rpcTcpHost'),
            port: config.get('rpcTcpPort'),
          }
        : {
            mode: 'ipc',
            socketPath: config.get('ipcPath'),
          },
      logger,
      config.get('rpcRetryConnect'),
    )

    const clientMemory = new IronfishMemoryClient({ logger })

    return new IronfishSdk(
      pkg || IronfishPKG,
      client,
      clientMemory,
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
    databaseName,
    autoSeed,
    privateIdentity,
  }: {
    databaseName?: string
    autoSeed?: boolean
    privateIdentity?: PrivateIdentity
  } = {}): Promise<IronfishNode> {
    const webSocket = (await require('ws')) as IsomorphicWebSocketConstructor

    const node = await IronfishNode.init({
      pkg: this.pkg,
      config: this.config,
      internal: this.internal,
      files: this.fileSystem,
      databaseName: databaseName,
      autoSeed: autoSeed,
      logger: this.logger,
      metrics: this.metrics,
      strategyClass: this.strategyClass,
      webSocket: webSocket,
      privateIdentity: privateIdentity,
      dataDir: this.dataDir,
    })

    if (this.config.get('enableRpcIpc')) {
      const namespaces = [
        ApiNamespace.account,
        ApiNamespace.chain,
        ApiNamespace.config,
        ApiNamespace.event,
        ApiNamespace.faucet,
        ApiNamespace.miner,
        ApiNamespace.node,
        ApiNamespace.peer,
        ApiNamespace.transaction,
        ApiNamespace.telemetry,
        ApiNamespace.worker,
      ]

      await node.rpc.mount(
        new IpcAdapter(
          namespaces,
          {
            mode: 'ipc',
            socketPath: this.config.get('ipcPath'),
          },
          this.logger,
        ),
      )
    }

    if (this.config.get('enableRpcTcp')) {
      const namespaces = [
        ApiNamespace.chain,
        ApiNamespace.event,
        ApiNamespace.faucet,
        ApiNamespace.miner,
        ApiNamespace.node,
        ApiNamespace.peer,
        ApiNamespace.transaction,
        ApiNamespace.telemetry,
        ApiNamespace.worker,
      ]

      if (this.config.get('rpcTcpSecure')) {
        namespaces.push(ApiNamespace.account, ApiNamespace.config)
      }

      await node.rpc.mount(
        new IpcAdapter(
          namespaces,
          {
            mode: 'tcp',
            host: this.config.get('rpcTcpHost'),
            port: this.config.get('rpcTcpPort'),
          },
          this.logger,
        ),
      )
    }

    return node
  }

  async connectRpc(forceLocal = false, forceRemote = false): Promise<IronfishRpcClient> {
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
    await this.clientMemory.connect({ node })
    await NodeUtils.waitForOpen(node)
    return this.clientMemory
  }
}
