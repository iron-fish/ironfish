/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Config,
  ConfigOptions,
  createRootLogger,
  DEV_GENESIS_ACCOUNT,
  Event,
  FollowChainStreamResponse,
  Logger,
  NodeFileProvider,
  PromiseUtils,
  RpcTcpClient,
  YupUtils,
} from '@ironfish/sdk'
import { ChildProcessWithoutNullStreams, exec, spawn } from 'child_process'
import { promisify } from 'util'
import {
  defaultOnError,
  defaultOnExit,
  ErrorEvent,
  ExitEvent,
  LogEvent,
  NodeLogEventSchema,
  supportedNodeChildProcesses,
} from './events'
import { sleep } from './misc'
import { importAccount } from './utils'

export const rootCmd = 'ironfish'

/**
 * SimulationNodeConfig is the configuration for a node in the simulation network.
 * All the `RequiredSimulationNodeConfig` options are required to start a node but defaults will be set
 * if they are not provided. The rest of the `ConfigOptions` are optional and will be used to override
 * the defaults.
 */
export type SimulationNodeConfig = RequiredSimulationNodeConfig &
  OptionalSimulationNodeConfig &
  Partial<Omit<ConfigOptions, keyof RequiredSimulationNodeConfig>>

/**
 * These options are required to start a node.
 */
export type RequiredSimulationNodeConfig = Required<
  Pick<
    ConfigOptions,
    | 'nodeName'
    | 'blockGraffiti'
    | 'peerPort'
    | 'networkId'
    | 'rpcTcpHost'
    | 'rpcTcpPort'
    | 'rpcHttpHost'
    | 'rpcHttpPort'
    | 'bootstrapNodes'
  >
>

/**
 * Additional configuration options for the node. These are not part of the `ConfigOptions` interface
 */
export type OptionalSimulationNodeConfig = {
  /**
   * The data directory for the node. If not provided, a temporary directory will be created.
   */
  dataDir: string
  /**
   * Display verbose logging from the node.
   */
  verbose?: boolean

  /**
   * Tags to include in the node logs. If omitted, all tags will be included.
   */
  logTags?: string[]
  /**
   * Whether the genesis account should be added to this node.
   * An explicit rescan will follow the import so the balance is immediately available.
   */
  importGenesisAccount?: boolean
}

/**
 * Global logger for use in the simulator node.
 */
const globalLogger = createRootLogger()

/**
 * SimulationNode is a wrapper around an Ironfish node for use in the simulation network.
 *
 * This class is responsible for the node, the miner, and
 * providing a client to interact with the node.
 *
 * The node itself can be accessed via another terminal by specifying it's
 * `data_dir` while it is running.
 *
 * This class should be constructed using the static `intiailize()` method.
 */
export class SimulationNode {
  /** Map of child processes to their names */
  procs = new Map<string, ChildProcessWithoutNullStreams>()

  nodeProcess: ChildProcessWithoutNullStreams

  /**
   * Optional miner process if the node is mining
   */
  minerProcess?: ChildProcessWithoutNullStreams

  /**
   *  @event Emits when new blocks are added to the chain
   */
  onBlock: Event<[FollowChainStreamResponse]> = new Event()

  /**
   * The last error encountered by the node. This is useful for debugging
   * when a node crashes or exits unexpectedly.
   */
  lastError: Error | undefined

  /**
   * @event Emits when the node logs a message to either stdout or stderr
   */
  onLog: Event<[LogEvent]> = new Event()
  /**
   * @event Emits when the node errors
   */
  onError: Event<[ErrorEvent]> = new Event()
  /**
   * @event Emits when the node exits
   */
  onExit: Event<[ExitEvent]> = new Event()

  /** The client used to make RPC calls against the underlying Ironfish node */
  client: RpcTcpClient
  /**
   * The config used to start the node. This config is not mandatory for the user to set,
   * as the simulator will fill in all the required options with defaults.
   */
  config: SimulationNodeConfig

  /** Promise that resolves when the node shuts down */
  private shutdownPromise: Promise<void>

  /** Call to resolve the shutdown promise */
  private shutdownResolve: () => void

  logger: Logger

  /** If the node is ready to be interacted with */
  ready = false

  /** If the node was stopped */
  stopped = false

  /**
   * The constructor should not be called.
   * Use the `initialize()` method to create a SimulationNode.
   */
  private constructor(
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

    // The data dir argument is required so the node starts up in the correct directory
    const args = ['start', '--datadir', this.config.dataDir]

    // Register any user-provided event handlers
    if (options?.onLog) {
      options.onLog.forEach((e) => this.onLog.on(e))
    }
    if (options?.onExit) {
      options.onExit.forEach((e) => this.onExit.on(e))
    }
    if (options?.onError) {
      options.onError.forEach((e) => this.onError.on(e))
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
   * @param config the config for the node
   * @param logger the logger to use for the node
   * @param options event handlers to handle events from child processes.
   * If not provided, the default handlers that log exits and errors will be used.
   *
   * @returns A new and ready SimulationNode
   */
  static async init(
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

    // TODO: support all the log levels, not just verbose
    if (config.verbose) {
      nodeConfig.set('logLevel', '*:debug')
    }

    for (const [key, value] of Object.entries(config)) {
      // This is a hack to get around the fact that the simulation node config
      // has `dataDir` / `verbose` properties that are not valid ironfish config options
      if (key === 'dataDir' || key === 'verbose') {
        continue
      }
      nodeConfig.set(key as keyof ConfigOptions, value)
    }

    // These config options have specific values that must be set
    // and thus are not configurable
    nodeConfig.set('jsonLogs', true)
    nodeConfig.set('enableRpc', true)
    nodeConfig.set('enableRpcTcp', true)
    nodeConfig.set('enableRpcTls', false)
    nodeConfig.set('enableRpcHttp', true)
    nodeConfig.set('miningForce', true)

    await nodeConfig.save()

    const node = new SimulationNode(config, client, logger, options)

    // Attempt to connect the client to the node until successful
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

    const { content: chainInfo } = await node.client.chain.getChainInfo()

    node.initializeBlockStream(chainInfo.currentBlockIdentifier.hash)

    if (config.importGenesisAccount) {
      await importAccount(node, `'${JSON.stringify(DEV_GENESIS_ACCOUNT)}'`, true)
    }

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
   *
   * @returns Whether the miner was successfully started
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
   * if you need to stop mining.
   *
   * @returns Whether the miner was successfully stopped
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
   * because currently the stream RPC  cannot be closed. The `onBlock` event will emit
   * every time a new block is added to the chain.
   *
   * To verify a transaction has been mined, you should attach a listener to the `onBlock` event
   * and wait for the transaction to appear.
   */
  initializeBlockStream(startingBlockHash: string): void {
    const blockStream = this.client.chain
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
   * @returns The block the transaction was mined in, or undefined if the transaction was not mined
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
          // TODO: is there a better way to remove the event listener?
          this.onBlock.off(checkBlock)
          resolve(resp.block)
        }
      }

      this.onBlock.on(checkBlock)
    })
  }

  /**
   * Starts the node process and attaches listeners to it. The ironfish
   * process is is spawned from `ironfish/node_modules/.bin/ironfish`.
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
   *
   * @returns A promise that resolves when the node has shutdown
   */
  async waitForShutdown(): Promise<void> {
    await this.shutdownPromise
  }

  /**
   * Stops the node process and cleans up any listeners or other child processes.
   *
   * @returns Whether the node was successfully stopped and the error message if it failed
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
   * Public function to kill a node
   */
  kill(): void {
    this.cleanup()
  }

  /**
   * Kills all child processes and handles any required cleanup
   */
  private cleanup(): void {
    this.logger.log(`cleaning up ${this.config.nodeName}...`)

    this.procs.forEach((proc) => {
      // TODO: handle kill response
      const _ = proc.kill()
    })

    this.procs.clear()

    // TODO: adding onExit here removes the exit handlers before they're executed on child process exit
    // which is breaking, but ideally it should be here
    // this.onExit.clear()

    this.onBlock.clear()
    this.onLog.clear()
    this.onError.clear()
  }

  /**
   * Executes a short-lived cli command via `child_process.spawn()`.
   *
   * If the user does not provide callbacks for errors or logs from the command, they will be printed to the console.
   *
   * This allows for the logs to be streamed to the console and the command to be executed in a separate process.
   * If the command fails, the promise will reject.
   *
   * @param command The ironfish cli command to execute
   * @param args The arguments to pass to the command. There should be 1 argument per string in the array.
   * @param options.onError The callback to execute if the command fails
   * @param options.onLog The callback to execute if the command writes to stdout / stderr
   * @rejects if the command encounters an error or returns with a non-zero code
   * @returns A promise that resolves when the command has finished executing
   */
  async executeCliCommand(
    command: string,
    commandArgs?: string[],
    options?: {
      onError?: (err: Error) => void
      onLog?: (stdout: string) => void
    },
  ): Promise<void> {
    const args = commandArgs || []

    args.push('--datadir', this.config.dataDir)

    const cmdString = rootCmd + ' ' + command + ' ' + args.join(' ')

    this.logger.log(`executing cli command (spawn): ${cmdString}`)

    const onLog = options?.onLog || ((stdout) => this.logger.log(stdout))
    const onError = options?.onError || ((err) => this.logger.error(JSON.stringify(err)))

    return new Promise((resolve, reject) => {
      const process = spawn(rootCmd, [command, ...args])

      process.stdout.on('data', (data) => {
        const message = (data as Buffer).toString()
        onLog(`${command}:stdout: ${message}`)
      })

      process.stderr.on('data', (data) => {
        const message = (data as Buffer).toString()
        onLog(`${command}:stderr: ${message}`)
      })

      process.on('error', (err) => {
        onError(err)
        reject(err)
      })

      process.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Command failed with code ${code || 'unknown'}`))
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Executes a cli command command via `child_process.exec()` asynchronously and returns the stdout and stderr.
   * `exec()` differs from `spawn()` as it buffers all of the output and returns it when the command has finished executing.
   * There is a maximum size for the buffer, so this should only be used for short-lived commands.
   *
   * This function should be used over `executeCliCommand()` if you need to pass complex arguments to the command.
   * This seems to be the case if any quotes / special characters are present in your arguments.
   * For instance, a stringified JSON object can be passed as an argument to this command.
   * Importing the genesis account uses this function to pass the genesis account JSON to the command because the
   * double quotes in the JSON string cannot be interpreted properly using `spawn()`.
   *
   * Async behaviour is achieved by wrapping the `child_process.exec()` function in a promise. This function
   * should be used if you need to execute a command and wait for it to complete before continuing.
   *
   * If the command fails, the error is thrown. Arguments should be passed in as an array
   * and will be concatened with spaces when the command is executed. The datadir of the node is
   * automatically to the end of the command.
   *
   * ```ts
   * try {
   *  // executes `ironfish status --all --datadir <datadir>`
   *  const { stdout, stderr } = await node.executeCliCommandAsync('status', ['--all'])
   * } catch (e) {
   *  const error = e as ExecException
   *  // handle error
   * }
   *```
   * @param command The ironfish cli command to execute
   * @param args The arguments for the command
   * @throws an `ExecException` if the command fails
   * @returns a promise containing the stdout and stderr output of the command
   */
  async executeCliCommandWithExec(
    command: string,
    args?: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    const execWithPromise = promisify(exec)

    if (!args) {
      args = []
    }

    args.push('--datadir', this.config.dataDir)

    const cmdString = rootCmd + ' ' + command + ' ' + args.join(' ')

    this.logger.log(`executing cli command (exec): ${cmdString}`)

    return execWithPromise(cmdString)
  }
}

/**
 * Public function to stop a node
 *
 * // TODO: This is because you cannot access the actual SimulationNode object with the
 * running node/miner procs from other cli commands. After an HTTP server is added to the simulation,
 * this should be removed and the stop function should be called directly on the SimulationNode object.
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
    await client.node.stopNode()
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
