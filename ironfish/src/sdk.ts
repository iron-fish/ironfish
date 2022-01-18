/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BoxKeyPair } from 'tweetnacl'
import { PrivateIdentity } from '.'
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
import { IsomorphicWebSocketConstructor } from './network/types'
import { IronfishNode } from './node'
import { Platform } from './platform'
import {
  ApiNamespace,
  IpcAdapter,
  IronfishIpcClient,
  IronfishMemoryClient,
  IronfishRpcClient,
} from './rpc'
import { Strategy } from './strategy'
import { NodeUtils } from './utils'

export class IronfishSdk {
  agent: string
  client: IronfishIpcClient
  clientMemory: IronfishMemoryClient
  config: Config
  fileSystem: FileSystem
  logger: Logger
  metrics: MetricsMonitor
  internal: InternalStore
  strategyClass: typeof Strategy | null
  privateIdentity: BoxKeyPair | null | undefined

  private constructor(
    agent: string,
    client: IronfishIpcClient,
    clientMemory: IronfishMemoryClient,
    config: Config,
    internal: InternalStore,
    fileSystem: FileSystem,
    logger: Logger,
    metrics: MetricsMonitor,
    strategyClass: typeof Strategy | null = null,
  ) {
    this.agent = agent
    this.client = client
    this.clientMemory = clientMemory
    this.config = config
    this.internal = internal
    this.fileSystem = fileSystem
    this.logger = logger
    this.metrics = metrics
    this.strategyClass = strategyClass
  }

  static async init({
    agent,
    configName,
    configOverrides,
    fileSystem,
    dataDir,
    logger = createRootLogger(),
    metrics,
    strategyClass,
  }: {
    agent?: string
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
      metrics = metrics || new MetricsMonitor(logger)
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

    const clientMemory = new IronfishMemoryClient(logger)

    agent = agent || 'sdk'

    return new IronfishSdk(
      agent,
      client,
      clientMemory,
      config,
      internal,
      fileSystem,
      logger,
      metrics,
      strategyClass,
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
      agent: Platform.getAgent(this.agent),
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
    await this.clientMemory.connect(node)
    await NodeUtils.waitForOpen(node)
    return this.clientMemory
  }
}
