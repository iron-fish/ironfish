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
import GIT_VERSION from './gitHash'
import { renderVersion } from './network/version'
import { IronfishStrategy, IronfishVerifier } from './strategy'
import { IsomorphicWebRtc, IsomorphicWebSocketConstructor } from './network/types'

const VERSION = '1'
const VERSION_PRODUCT = 'ironfish-sdk'
const VERSION_CODE = GIT_VERSION

export class IronfishSdk {
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
    configName,
    configOverrides,
    fileSystem,
    dataDir,
    logger = createRootLogger(),
    metrics,
    verifierClass,
    strategyClass,
  }: {
    configName?: string
    configOverrides?: Partial<ConfigOptions>
    fileSystem?: FileSystem
    dataDir?: string
    logger?: Logger
    metrics?: MetricsMonitor
    verifierClass?: typeof IronfishVerifier
    strategyClass?: typeof IronfishStrategy
  } = {}): Promise<IronfishSdk> {
    const runtime = getRuntime()

    if (!fileSystem) {
      if (runtime === 'node') {
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

    return new IronfishSdk(
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
      agent: this.getVersion('cli'),
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

  /**
   * Combines the SDK's version with the name of the client using the SDK
   * to produce a version string usable by the peer network code.
   * @param agentName The name of the agent using the SDK. e.g. cli, browser
   */
  getVersion(agentName: string): string {
    return renderVersion({
      version: VERSION,
      product: VERSION_PRODUCT,
      code: VERSION_CODE,
      agent: agentName,
    })
  }
}

/**
 * Get the current javascript runtime
 */
export function getRuntime(): 'node' | 'browser' | 'unknown' {
  if (
    typeof process === 'object' &&
    process &&
    process.release &&
    process.versions &&
    typeof process.versions.node === 'string'
  ) {
    return 'node'
  }

  return 'unknown'
}
