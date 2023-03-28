/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Config,
  ConfigOptions,
  Event,
  FollowChainStreamResponse,
  NodeFileProvider,
  PromiseUtils,
  RpcTcpClient,
  YupUtils,
} from '@ironfish/sdk'
import { createRootLogger, Logger } from '@ironfish/sdk'
import chalk from 'chalk'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import * as yup from 'yup'
import { getLatestBlockHash } from './chain'
import { sleep } from './utils'

export const rootCmd = 'ironfish'

/**
 * SimulationNodeConfig is the configuration for a node in the simulation network.
 */
export type SimulationNodeConfig = Required<RequiredUserSimulationNodeConfig> &
  Partial<OptionalUserSimulationNodeConfig> & {
    dataDir: string
    verbose?: boolean
  }

/**
 * These options are required from the user to start a node.
 */
type RequiredUserSimulationNodeConfig = Pick<
  ConfigOptions,
  | 'nodeName'
  | 'blockGraffiti'
  | 'peerPort'
  | 'networkId'
  | 'rpcTcpHost'
  | 'rpcTcpPort'
  | 'bootstrapNodes'
>

/**
 * These options are required to start a node, but have set default values that the
 * user currently cannot change.
 * */
type RequiredDefaultSimulationNodeConfig = Pick<
  ConfigOptions,
  'enableRpc' | 'enableRpcTcp' | 'enableRpcTls' | 'miningForce'
>

/**
 * Optional config values that can be set on the node.
 * There is no explicit support for these options, and thus might break a simulation node,
 * but they can be set.
 */
type OptionalUserSimulationNodeConfig = Omit<
  ConfigOptions,
  keyof (RequiredUserSimulationNodeConfig & RequiredDefaultSimulationNodeConfig)
>

const globalLogger = createRootLogger()

type supportedNodeChildProcesses = 'miner' | 'node'

/**
 * defaultOnEixt is the default onExit handler for a SimulationNode. It logs the exit event, in red, to the console.
 * @param logger The logger to use
 */
const defaultOnExit =
  (logger: Logger) =>
  (event: ExitEvent): void =>
    logger.log(chalk.red(`[${event.node}:exit]`) + ` ${JSON.stringify(event)}`)

/**
 *  defaultOnError is the default onError handler for a SimulationNode. It logs the error event, in red, to the console.
 * @param logger The logger to use
 */
const defaultOnError =
  (logger: Logger) =>
  (event: ErrorEvent): void =>
    logger.log(chalk.red(`[${event.node}:error]`) + ` ${JSON.stringify(event)}`)

/**
 * LogEvent that is emitted to any `onLog` listeners when a child process writes to stdout or stderr.
 */
export type LogEvent = {
  node: string
  type: 'stdout' | 'stderr'
  proc: supportedNodeChildProcesses
  message: string
  jsonMessage?: NodeLogEvent
  timestamp: string
}

/**
 * NodeLogEvent is the JSON object that is logged by the Ironfish node.
 * This is wrapped in a LogEvent when it is emitted to any listeners.
 */
type NodeLogEvent = {
  date: string
  level: string
  message: string
  tag: string
}

/**
 * NodeLogEventSchema is the schema for a NodeLogEvent. This is used to validate that the JSON
 * object that is logged by the Ironfish node is valid.
 */
export const NodeLogEventSchema: yup.ObjectSchema<NodeLogEvent> = yup
  .object({
    date: yup.string().required(),
    level: yup.string().required(),
    message: yup.string().required(),
    tag: yup.string().required(),
  })
  .required()

/**
 * CloseEvent is emitted to any `onClose` listeners when a child process is closed.
 */
export type CloseEvent = {
  node: string
  proc: supportedNodeChildProcesses
  code: number | null
  timestamp: string
}

/**
 * ExitEvent is emitted to any `onExit` listeners when a child process exits.
 */
export type ExitEvent = {
  node: string
  proc: supportedNodeChildProcesses
  code: number | null
  signal: NodeJS.Signals | null
  lastErr: Error | undefined
  timestamp: string
}

/**
 * ErrorEvent is emitted to any `onError` listeners when a child process emits an error.
 */
export type ErrorEvent = {
  node: string
  proc: supportedNodeChildProcesses
  error: Error
  timestamp: string
}

/**
 * SimulationNode is a wrapper around an Ironfish node for use in the simulation network.
 *
 * This class is responsible for the node, the miner, and
 * providing a client to interact with the node.
 *
 * The node itself can be accessed via another terminal by specifying it's
 * `data_dir` while it is running.
 *
 * This class should be created using the static `intiailize` method and not constructed
 * using `new SimulationNode()`.
 */
export class SimulationNode {
  procs = new Map<string, ChildProcessWithoutNullStreams>()
  nodeProcess: ChildProcessWithoutNullStreams
  minerProcess?: ChildProcessWithoutNullStreams

  onBlock: Event<[FollowChainStreamResponse]> = new Event()

  lastError: Error | undefined

  onLog: Event<[LogEvent]> = new Event()
  onError: Event<[ErrorEvent]> = new Event()
  onExit: Event<[ExitEvent]> = new Event()

  client: RpcTcpClient
  config: SimulationNodeConfig

  shutdownPromise: Promise<void>
  shutdownResolve: () => void

  logger: Logger

  ready = false
  stopped = false

  constructor(
    config: SimulationNodeConfig,
    client: RpcTcpClient,
    logger: Logger,
    options?: {
      onLog?: ((l: LogEvent) => void | Promise<void>)[]
      onExit?: ((e: ExitEvent) => void | Promise<void>)[]
      onError?: ((e: ErrorEvent) => void | Promise<void>)[]
    },
  ) {
    this.config = config
    this.client = client
    this.logger = logger.withTag(`${config.nodeName}`)

    // Data dir is required here
    const args = ['start', '--datadir', this.config.dataDir]

    // Register any user-provided event handlers
    if (options) {
      if (options.onLog) {
        options.onLog.forEach((e) => this.onLog.on(e))
      }
      if (options.onExit) {
        options.onExit.forEach((e) => this.onExit.on(e))
      }
      if (options.onError) {
        options.onError.forEach((e) => this.onError.on(e))
      }
    }

    this.nodeProcess = this.startNodeProcess(args)

    // TODO(holahula): hack to clean up when the node process exits
    this.onExit.on((exit) => {
      if (exit.proc === 'node') {
        if (this.shutdownResolve) {
          this.shutdownResolve()
          this.stopped = true
        }
        this.cleanup()
      }
    })

    const [shutdownPromise, shutdownResolve] = PromiseUtils.split<void>()
    this.shutdownPromise = shutdownPromise
    this.shutdownResolve = shutdownResolve

    this.logger.log(`started node: ${this.config.nodeName}`)
  }

  /**
   * Initializes a new SimulationNode. This should be used instead of the constructor
   * to ensure that the node is ready to be used. Upon return, the node will be ready
   * for any client RPC calls.
   *
   * @param config The config for the node
   * @param logger The logger to use for the node
   * @param options Optional event handlers to handle log, close, and error events from the node / miner processes
   *
   * @returns A new and ready SimulationNode
   */
  static async initialize(
    config: SimulationNodeConfig,
    logger: Logger,
    options?: {
      onLog?: ((l: LogEvent) => void | Promise<void>)[]
      onExit?: ((e: ExitEvent) => void | Promise<void>)[]
      onError?: ((c: ErrorEvent) => void | Promise<void>)[]
    },
  ): Promise<SimulationNode> {
    const client = new RpcTcpClient(config.rpcTcpHost, config.rpcTcpPort)

    if (options) {
      options.onExit = options.onExit || [defaultOnExit(logger)]
      options.onError = options.onError || [defaultOnError(logger)]
    }

    // Create a starting config in the datadir before starting the node
    const fileSystem = new NodeFileProvider()
    await fileSystem.init()
    const nodeConfig = new Config(fileSystem, config.dataDir)
    await nodeConfig.load()

    // These config options have default values that must be set
    nodeConfig.set('jsonLogs', true)
    nodeConfig.set('enableRpc', true)
    nodeConfig.set('enableRpcTcp', true)
    nodeConfig.set('enableRpcTls', false)
    nodeConfig.set('miningForce', true)

    if (config.verbose) {
      nodeConfig.set('logLevel', '*:verbose')
    }

    for (const [key, value] of Object.entries(config)) {
      if (key === 'dataDir' || key === 'verbose') {
        continue
      }
      nodeConfig.set(key as keyof ConfigOptions, value)
    }

    await nodeConfig.save()

    const node = new SimulationNode(config, client, logger, options)

    let connected = false
    let tries = 0
    while (!connected && tries < 12) {
      connected = await client.tryConnect()
      tries++
      await sleep(250)
    }

    if (!connected) {
      throw new Error(`failed to connect to node ${config.nodeName}`)
    }

    node.initializeBlockStream(await getLatestBlockHash(node))

    node.ready = true

    return node
  }

  /**
   * Attaches listeners to a child process and adds the process to the node's
   * list of child processes.
   *
   * @param proc The child process to add
   * @param procName The name of the process, used for logging and accessing the proc.
   */
  private registerChildProcess(
    proc: ChildProcessWithoutNullStreams,
    procName: supportedNodeChildProcesses,
  ): void {
    this.attachListeners(proc, procName)
    this.procs.set(procName, proc)
  }

  /**
   *
   * Starts and attaches a miner process to the simulation node
   */
  public startMiner(): boolean {
    if (this.minerProcess) {
      return false
    }

    this.logger.log(`attaching miner to ${this.config.nodeName}...`)

    this.minerProcess = spawn('ironfish', [
      'miners:start',
      '-t',
      '1',
      '--datadir',
      this.config.dataDir,
    ])

    this.registerChildProcess(this.minerProcess, 'miner')

    return true
  }

  /**
   * Stops and detaches the miner process from the node. This can be called at any time during the simulation
   * if you would like to stop mining.
   *
   * @returns Whether the miner was successfully detached
   */
  public stopMiner(): boolean {
    if (!this.minerProcess) {
      throw new Error('Miner process not found')
    }

    this.logger.log(`detaching miner from ${this.config.nodeName}...`)

    const success = this.minerProcess.kill()

    this.procs.delete('miner')
    this.minerProcess = undefined

    return success
  }

  /**
   * Initializes a block stream for a node. Each node should only have 1 block stream
   * because currently the stream RPC  cannot be closed.
   *
   * To verify a transaction has been mined, you should attach a listener to the `onBlock` event
   * and wait for the transaction to appear.
   */
  initializeBlockStream(startingBlockHash: string): void {
    const blockStream = this.client
      .followChainStream({ head: startingBlockHash.toString() })
      .contentStream()

    const stream = async () => {
      for await (const block of blockStream) {
        this.onBlock.emit(block)
      }
    }

    void stream()
  }

  /**
   * Waits for a transaction to be mined and returns the block it was mined in.
   * If the transaction is not mined before the expiration sequence, it will return undefined.
   *
   * @param transactionHash The hash of the transaction to wait for
   * @returns The block the transaction was mined in or undefined if the transaction was not mined
   */
  async waitForTransactionConfirmation(
    transactionHash: string,
    expirationSequence?: number,
  ): Promise<FollowChainStreamResponse['block'] | undefined> {
    return new Promise((resolve) => {
      const checkBlock = (resp: FollowChainStreamResponse) => {
        const hasTransation = resp.block.transactions.find(
          (t) => t.hash.toLowerCase() === transactionHash,
        )

        if (
          resp.type === 'connected' &&
          expirationSequence &&
          resp.block.sequence >= expirationSequence
        ) {
          this.onBlock.off(checkBlock)
          resolve(undefined)
        }

        if (resp.type === 'connected' && hasTransation) {
          // TODO: is there a better way to unsubscribe to the event?
          this.onBlock.off(checkBlock)
          resolve(resp.block)
        }
      }

      this.onBlock.on(checkBlock)
    })
  }

  /**
   * Starts the node process and attaches listeners to it.
   *
   * @param args The arguments to pass to the node process. These arguments follow
   * the same format as the CLI.
   *
   * @returns The node process
   */
  private startNodeProcess(args: string[]): ChildProcessWithoutNullStreams {
    const nodeProc = spawn(rootCmd, args)
    this.registerChildProcess(nodeProc, 'node')

    return nodeProc
  }

  /**
   * Utility function to wait for the node to shutdown.
   */
  async waitForShutdown(): Promise<void> {
    await this.shutdownPromise
  }

  /**
   * Stops the node process and cleans up any listeners or other child processes.
   */
  async stop(): Promise<{ success: boolean; msg: string }> {
    this.logger.log(`killing node ${this.config.nodeName}...`)

    return stopSimulationNode(this.config)
  }

  /**
   * Adds listeners to the events for a child process.
   * The events are forwarded to the on<Event> event emitters and can be subscribed to.
   *
   * @param p The process to attach listeners to
   * @param procName The name of the process, used for logging
   */
  private attachListeners(
    p: ChildProcessWithoutNullStreams,
    proc: supportedNodeChildProcesses,
  ): void {
    p.stdout.on('data', (data) => {
      const message = (data as Buffer).toString()
      void YupUtils.tryValidate(NodeLogEventSchema, message).then(({ result }) => {
        this.onLog.emit({
          node: this.config.nodeName,
          proc,
          type: 'stdout',
          message,
          timestamp: new Date().toISOString(),
          ...(result ? { jsonMessage: result } : {}),
        })
      })
    })

    p.stderr.on('data', (data) => {
      const message = (data as Buffer).toString()
      void YupUtils.tryValidate(NodeLogEventSchema, message).then(({ result }) => {
        this.onLog.emit({
          node: this.config.nodeName,
          proc,
          type: 'stderr',
          message,
          timestamp: new Date().toISOString(),
          ...(result ? { jsonMessage: result } : {}),
        })
      })
    })

    p.on('error', (error: Error) => {
      this.lastError = error

      this.onError.emit({
        node: this.config.nodeName,
        proc,
        error,
        timestamp: new Date().toISOString(),
      })
    })

    // The exit event is emitted when the child process ends.
    // The last error encountered by the process is emitted in the event that this is an unexpected exit.
    p.on('exit', (code, signal) => {
      this.onExit.emit({
        node: this.config.nodeName,
        proc,
        code,
        signal,
        lastErr: this.lastError,
        timestamp: new Date().toISOString(),
      })
    })

    return
  }

  /**
   * Kills all child processes and handles any required cleanup
   */
  private cleanup(): void {
    this.logger.log(`cleaning up ${this.config.nodeName}...`)

    // TODO: at this point you know the node proc is dead, should we remove from map?
    this.procs.forEach((proc) => {
      // TODO: handle proc.kill?
      const _ = proc.kill()
    })

    // adding onExit here removes the exit handlers before they're executed on child process exit
    // but ideally it should be here
    // this.onExit.clear()

    // this.onBlock.clear()
    // this.onLog.clear()
    // this.onError.clear()
  }
}

/**
 * Public function to stop a node
 *
 * This is because you cannot access the actual SimulationNode object with the
 * running node/miner procs from other cli commands
 */
export async function stopSimulationNode(node: {
  nodeName: string
  dataDir: string
  rpcTcpHost: string
  rpcTcpPort: number
}): Promise<{ success: boolean; msg: string }> {
  const client = new RpcTcpClient(node.rpcTcpHost, node.rpcTcpPort)

  try {
    const connectSuccess = await client.tryConnect()
    if (!connectSuccess) {
      throw new Error(`failed to connect to node ${node.nodeName}`)
    }
  } catch (e) {
    globalLogger.log(`error creating client to connect to node ${node.nodeName}: ${String(e)}`)
  }

  let success = true
  let msg = ''

  try {
    await client.stopNode()
  } catch (error) {
    if (error instanceof Error) {
      msg = error.message
    } else {
      msg = String(error)
    }
    success = false
  }

  return { success, msg }
}
