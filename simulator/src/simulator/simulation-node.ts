/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  ConfigOptions,
  Event,
  FollowChainStreamResponse,
  PromiseUtils,
  RpcTcpClient,
} from '@ironfish/sdk'
import { createRootLogger, Logger } from '@ironfish/sdk'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { getLatestBlockHash } from './chain'
import { sleep } from './utils'

export const rootCmd = 'ironfish'

export type SimulationNodeConfig = Required<RequiredSimulationNodeConfig> &
  Partial<OptionalSimulationNodeConfig> & { dataDir: string; verbose?: boolean }

type RequiredSimulationNodeConfig = Pick<
  ConfigOptions,
  | 'nodeName'
  | 'blockGraffiti'
  | 'peerPort'
  | 'networkId'
  | 'rpcTcpHost'
  | 'rpcTcpPort'
  | 'bootstrapNodes'
  // TODO(austin): these have required values, should they be included
  // | 'enableRpc' // true
  // | 'enableRpcTcp' // true
  // | 'enableRpcTls' // false
  // | 'miningForce'
>

type OptionalSimulationNodeConfig = Omit<ConfigOptions, keyof RequiredSimulationNodeConfig>

const globalLogger = createRootLogger()

export type supportedNodeChildProcesses = 'miner' | 'node'

export type LogEvent = {
  node: string
  type: 'stdout' | 'stderr'
  proc: supportedNodeChildProcesses
  message: string
  timestamp: string
}

export type CloseEvent = {
  node: string
  proc: supportedNodeChildProcesses
  code: number | null
  timestamp: string
}

export type ExitEvent = {
  node: string
  proc: supportedNodeChildProcesses
  code: number | null
  timestamp: string
  signal: NodeJS.Signals | null
}

export type ErrorEvent = {
  node: string
  proc: supportedNodeChildProcesses
  error: Error
  timestamp: string
}

/**
 * Wrapper around an Ironfish node for use in the simulation network.
 *
 * This class is responsible for starting and stopping the node, and
 * providing a client to interact with the node. If the node is a miner,
 * it will also start and stop the miner.
 *
 * The node itself can be accessed via another terminal by specifying it's
 * data_dir while it is running.
 *
 * This class should be instantiated with the static `intiailize` method.
 */
export class SimulationNode {
  procs = new Map<string, ChildProcessWithoutNullStreams>()
  nodeProcess: ChildProcessWithoutNullStreams
  minerProcess?: ChildProcessWithoutNullStreams

  onBlock: Event<[FollowChainStreamResponse]> = new Event()

  onLog: Event<[LogEvent]> = new Event()
  onError: Event<[ErrorEvent]> = new Event()
  onClose: Event<[CloseEvent]> = new Event()
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
      onClose?: ((c: CloseEvent) => void | Promise<void>)[]
      onExit?: ((e: ExitEvent) => void | Promise<void>)[]
      onError?: ((e: ErrorEvent) => void | Promise<void>)[]
    },
  ) {
    this.config = config

    this.client = client

    this.logger = logger.withTag(`${config.nodeName}`)

    // TODO(austin): this is gross fix this
    // use config rpc call instead of this

    let args =
      'start --name ' +
      this.config.nodeName +
      ' --graffiti ' +
      this.config.blockGraffiti +
      ' --port ' +
      this.config.peerPort.toString() +
      ' --datadir ' +
      this.config.dataDir +
      ' --networkId ' +
      this.config.networkId.toString() +
      ' --bootstrap ' +
      this.config.bootstrapNodes[0] +
      ' --rpc.tcp' +
      ' --rpc.tcp.host ' +
      this.config.rpcTcpHost +
      ' --rpc.tcp.port ' +
      this.config.rpcTcpPort.toString() +
      ' --no-rpc.tcp.tls' +
      // This needs to be set otherwise you run into 'not synced' errors
      ' --forceMining'

    if (config.verbose) {
      args += ' --verbose'
    }

    // Register user event handlers
    if (options) {
      if (options.onLog) {
        options.onLog.forEach((l) => this.onLog.on(l))
      }
      if (options.onClose) {
        options.onClose.forEach((c) => this.onClose.on(c))
      }
      if (options.onExit) {
        options.onExit.forEach((e) => this.onExit.on(e))
      }
      if (options.onError) {
        options.onError.forEach((e) => this.onError.on(e))
      }
    }

    this.nodeProcess = this.startNodeProcess(args)

    // TODO(austin): should exit handler go here or in `intialize()`?
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
   * to ensure that the node is ready to be used.
   *
   * @param config The config for the node
   * @param logger The logger to use for the node
   * @param options Optional event handlers from the node process
   * @returns A new SimulationNode
   */
  static async initialize(
    config: SimulationNodeConfig,
    logger: Logger,
    options?: {
      onLog?: ((l: LogEvent) => void | Promise<void>)[]
      onClose?: ((c: CloseEvent) => void | Promise<void>)[]
      onExit?: ((e: ExitEvent) => void | Promise<void>)[]
      onError?: ((c: ErrorEvent) => void | Promise<void>)[]
    },
  ): Promise<SimulationNode> {
    const client = new RpcTcpClient(config.rpcTcpHost, config.rpcTcpPort)

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
   *
   * @param proc Adds a child process to the node and attaches any listeners.
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
      throw new Error('Miner process already exists')
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
   * because the streams currently cannot be closed.
   *
   * To verify a transaction has been mined, you should attach a block stream consumer to the node
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

  async waitForTransactionConfirmation(
    transactionHash: string,
  ): Promise<FollowChainStreamResponse['block'] | undefined> {
    return new Promise((resolve) => {
      const checkBlock = (resp: FollowChainStreamResponse) => {
        const hasTransation = resp.block.transactions.find(
          (t) => t.hash.toLowerCase() === transactionHash,
        )

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
  private startNodeProcess(args: string): ChildProcessWithoutNullStreams {
    // this.logger.log(rootCmd + ' ' + args)
    const nodeProc = spawn(rootCmd, args.split(' '))
    this.registerChildProcess(nodeProc, 'node')

    return nodeProc
  }

  async waitForShutdown(): Promise<void> {
    await this.shutdownPromise
  }

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
      this.onLog.emit({
        node: this.config.nodeName,
        proc,
        type: 'stdout',
        message: (data as Buffer).toString(),
        timestamp: new Date().toISOString(),
      })
    })

    p.stderr.on('data', (data) => {
      this.onLog.emit({
        node: this.config.nodeName,
        proc,
        type: 'stderr',
        message: (data as Buffer).toString(),
        timestamp: new Date().toISOString(),
      })
    })

    p.on('error', (error: Error) => {
      this.onError.emit({
        node: this.config.nodeName,
        proc,
        error,
        timestamp: new Date().toISOString(),
      })

      // TODO(austin): this.logger.withTag() is not working here? no tag being printed to console
      this.logger.log(`[${this.config.nodeName}:${proc}:error] ${error.message}`)
    })

    /**
     * From https://github.com/nodejs/node/blob/8a6b37bc51a353227b6711d3c1df12c2863e3302/doc/api/child_process.md#event-close
     *
     * The 'close' event is emitted when the stdio streams of a child process have been closed.
     * This is distinct from the 'exit' event, since multiple processes might share the same stdio streams.
     */
    p.on('close', (code: number | null) => {
      this.onClose.emit({
        node: this.config.nodeName,
        proc,
        code,
        timestamp: new Date().toISOString(),
      })

      this.logger.log(`[${this.config.nodeName}:${proc}:close] child process closed`, {
        ...(code ? { code } : {}),
      })
    })

    // TODO: add an event on exit
    // looks for the last error type from the logger and emits it
    // this way tests can look for exit events and potentially act on that
    p.on('exit', (code, signal) => {
      this.onExit.emit({
        node: this.config.nodeName,
        proc,
        code,
        signal,
        timestamp: new Date().toISOString(),
      })

      this.logger.log(`${this.config.nodeName}:${proc}:exit`, {
        ...(code ? { code } : { code: 'no code' }),
        ...(signal ? { signal: signal?.toString() } : { signal: 'no signal' }),
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

    // adding onExit here prevents exit handlers from being executed but ideally it should be here
    // this.onBlock.clear()
    // this.onLog.clear()
    // this.onClose.clear()
    // this.onError.clear()
    // this.onExit.clear()
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
