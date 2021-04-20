/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Logger,
  createRootLogger,
  setLogLevelFromConfig,
  setLogPrefixFromConfig,
  setLogColorEnabledFromConfig,
} from './logger'
import { MetricsMonitor } from './metrics'
import { Config, ConfigOptions } from './fileStores'
import { FileSystem, NodeFileProvider } from './fileSystems'
import { IronfishNode } from './node'
import { ApiNamespace, IpcAdapter, IronfishIpcClient, IronfishMemoryClient } from './rpc'
import { InternalStore } from './fileStores'
import { IsomorphicWebRtc, IsomorphicWebSocketConstructor } from './network/types'
import { Platform } from './platform'
import { IronfishVerifier } from './consensus'
import { IronfishStrategy } from './strategy'

export class IronfishSdk {
  agent: string
  client: IronfishIpcClient
  clientMemory: IronfishMemoryClient
  config: Config
  fileSystem: FileSystem
  logger: Logger
  metrics: MetricsMonitor
  internal: InternalStore
  verifierClass: typeof IronfishVerifier | null
  strategyClass: typeof IronfishStrategy | null

  private constructor(
    agent: string,
    client: IronfishIpcClient,
    clientMemory: IronfishMemoryClient,
    config: Config,
    internal: InternalStore,
    fileSystem: FileSystem,
    logger: Logger,
    metrics: MetricsMonitor,
    verifierClass: typeof IronfishVerifier | null = null,
    strategyClass: typeof IronfishStrategy | null = null,
  ) {
    this.agent = agent
    this.client = client
    this.clientMemory = clientMemory
    this.config = config
    this.internal = internal
    this.fileSystem = fileSystem
    this.logger = logger
    this.metrics = metrics
    this.verifierClass = verifierClass
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
    verifierClass,
    strategyClass,
  }: {
    agent?: string
    configName?: string
    configOverrides?: Partial<ConfigOptions>
    fileSystem?: FileSystem
    dataDir?: string
    logger?: Logger
    metrics?: MetricsMonitor
    verifierClass?: typeof IronfishVerifier
    strategyClass?: typeof IronfishStrategy
  } = {}): Promise<IronfishSdk> {
    const runtime = Platform.getRuntime()

    if (!fileSystem) {
      if (runtime.type === 'node') {
        fileSystem = new NodeFileProvider()
        await fileSystem.init()
      } else throw new Error(`No default fileSystem for ${String(runtime)}`)
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
      verifierClass,
      strategyClass,
    )
  }

  async node({ databaseName }: { databaseName?: string } = {}): Promise<IronfishNode> {
    const webSocket = (await require('ws')) as IsomorphicWebSocketConstructor
    const webRtc = (await require('wrtc')) as IsomorphicWebRtc | undefined

    const node = await IronfishNode.init({
      agent: Platform.getAgent(this.agent),
      config: this.config,
      internal: this.internal,
      files: this.fileSystem,
      databaseName: databaseName,
      logger: this.logger,
      metrics: this.metrics,
      verifierClass: this.verifierClass,
      strategyClass: this.strategyClass,
      webRtc: webRtc,
      webSocket: webSocket,
    })

    const namespaces = [
      ApiNamespace.account,
      ApiNamespace.chain,
      ApiNamespace.config,
      ApiNamespace.faucet,
      ApiNamespace.miner,
      ApiNamespace.node,
      ApiNamespace.peer,
      ApiNamespace.transaction,
      ApiNamespace.telemetry,
    ]

    if (this.config.get('enableRpcIpc')) {
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
}
