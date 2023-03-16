/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Event,
  FollowChainStreamResponse,
  GetLogStreamResponse,
  RpcTcpClient,
} from '@ironfish/sdk'
import { createRootLogger, Logger } from '@ironfish/sdk'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { getLatestBlockHash } from './chain'
import { sleep } from './utils'

export const rootCmd = 'ironfish'

export type SimulationNodeConfig = {
  name: string
  graffiti: string
  port: number
  verbose?: boolean
  data_dir: string
  netword_id: number
  bootstrap_url: string
  tcp_host: string
  tcp_port: number
}

const globalLogger = createRootLogger()

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
  minerInitialized = false

  onBlock?: Event<[FollowChainStreamResponse]>
  onLog?: Event<[GetLogStreamResponse]>

  client: RpcTcpClient
  config: SimulationNodeConfig

  shutdownPromise: Promise<void> | null = null
  shutdownResolve: (() => void) | null = null

  logger: Logger

  ready = false

  constructor(config: SimulationNodeConfig, client: RpcTcpClient, logger: Logger) {
    this.config = config

    this.client = client

    this.logger = logger.withTag(`${config.name}`)

    // TODO(austin): this is gross fix this
    let args =
      'start --name ' +
      this.config.name +
      ' --graffiti ' +
      this.config.graffiti +
      ' --port ' +
      this.config.port.toString() +
      ' --datadir ' +
      this.config.data_dir +
      ' --networkId ' +
      this.config.netword_id.toString() +
      ' --bootstrap ' +
      this.config.bootstrap_url +
      ' --rpc.tcp' +
      ' --rpc.tcp.host ' +
      this.config.tcp_host +
      ' --rpc.tcp.port ' +
      this.config.tcp_port.toString() +
      ' --no-rpc.tcp.tls' +
      // TODO: this needs to be set otherwise you run into 'not synced' errors
      ' --forceMining'

    if (config.verbose) {
      args += ' --verbose'
    }

    this.nodeProcess = this.startNodeProcess(args)

    this.logger.log(`started node: ${this.config.name}`)
  }

  /**
   * Initializes a new SimulationNode. This should be used instead of the constructor
   * to ensure that the node is ready to be used.
   *
   * @param config The config for the node
   * @param logger The logger to use for the node
   * @returns A new SimulationNode
   */
  static async initialize(
    config: SimulationNodeConfig,
    logger: Logger,
  ): Promise<SimulationNode> {
    const client = new RpcTcpClient(config.tcp_host, config.tcp_port)

    const node = new SimulationNode(config, client, logger)

    node.shutdownPromise = new Promise((resolve) => (node.shutdownResolve = resolve))

    // TODO: race condition, client connect should wait until node process is ready
    await sleep(5000)

    const success = await client.tryConnect()
    if (!success) {
      throw new Error(`failed to connect to node ${this.name}`)
    }

    void node.initializeStreams()

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
    procName: string,
    verbose?: boolean,
  ): void {
    this.attachListeners(proc, procName, verbose)
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

    this.logger.log(`attaching miner to ${this.config.name}...`)

    this.minerProcess = spawn('ironfish', [
      'miners:start',
      '-t',
      '1',
      '--datadir',
      this.config.data_dir,
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

    this.logger.log(`detaching miner from ${this.config.name}...`)

    const success = this.minerProcess.kill()

    this.procs.delete('miner')
    this.minerProcess = undefined

    return success
  }

  async initializeStreams(): Promise<void> {
    await this.initializeBlockStream(await getLatestBlockHash(this))
    await this.intializeLogStream()
  }

  /**
   * Initializes a block stream for a node. Each node should only have 1 block stream
   * because the streams currently cannot be closed.
   *
   * To verify a transaction has been mined, you should attach a block stream consumer to the node
   * and wait for the transaction to appear.
   */
  async initializeBlockStream(startingBlockHash: string): Promise<void> {
    if (this.onBlock) {
      return
    }

    this.onBlock = new Event()

    const blockStream = this.client
      .followChainStream({ head: startingBlockHash.toString() })
      .contentStream()

    for await (const block of blockStream) {
      this.onBlock.emit(block)
    }
  }

  async intializeLogStream(): Promise<void> {
    if (this.onLog) {
      return
    }

    this.onLog = new Event()

    const logStream = this.client.getLogStream().contentStream()

    for await (const log of logStream) {
      this.onLog.emit(log)
    }
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
          this.onBlock?.off(checkBlock)
          resolve(resp.block)
        }
      }

      this.onBlock?.on(checkBlock)
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
    this.logger.log(rootCmd + ' ' + args)
    const nodeProc = spawn(rootCmd, args.split(' '))
    this.registerChildProcess(nodeProc, 'node', this.config.verbose)

    return nodeProc
  }

  async waitForShutdown(): Promise<void> {
    await this.shutdownPromise
  }

  async stop(): Promise<{ success: boolean; msg: string }> {
    this.logger.log(`killing node ${this.config.name}...`)

    return stopSimulationNode(this.config)
  }

  /**
   * Adds listeners to the input/output streams for a new proc.
   * Currently this just connects your process to this.logger.log
   *
   * @param p The process to attach listeners to
   * @param procName The name of the process, used for logging
   */
  private attachListeners(
    p: ChildProcessWithoutNullStreams,
    procName: string,
    verbose?: boolean,
  ): void {
    const filtered = [
      'Requesting',
      // 'Successfully mined block',
      // 'Added block',
      'Starting sync from',
      'Found peer',
      'Finding ancestor',
      'Hashrate...',
      'Finished syncing',
    ]

    const verboseFiltered = [
      'NewPooledTransactionHashes',
      'PooledTransactionsResponse',
      'PooledTransactionsRequest',
      'NewBlockHashes',
      'WebSocket unidentified STATE',
      'NewCompactBlock',
      'NewTransactions',
      'Flushed',
    ]

    p.stdout.on('data', (data) => {
      const str = (data as Buffer).toString()

      let log = true
      filtered.forEach((filter) => {
        if (str.startsWith(filter)) {
          log = false
        }
      })

      if (verbose && log) {
        verboseFiltered.forEach((filter) => {
          if (str.includes(filter)) {
            log = false
          }
        })
      }

      if (log) {
        this.logger.withTag(`${procName}:stdout`).log(`${str}`)
      }
    })

    p.stderr.on('data', (data) => {
      const str = (data as Buffer).toString()

      let log = true
      filtered.forEach((filter) => {
        if (str.startsWith(filter)) {
          log = false
        }
      })

      if (log) {
        this.logger.withTag(`${procName}:stderr`).log(`${str}`)
      }
    })

    p.on('error', (error: Error) => {
      const msg = error.message
      this.logger.withTag(`${this.config.name}:${procName}:error`).log(`${msg}`)
    })

    p.on('close', (code: number | null) => {
      this.logger.withTag(`${this.config.name}:${procName}:close`).log(`child process exited`, {
        code,
      })
    })

    p.on('exit', (code, signal) => {
      this.logger.log(procName + ' exited', { code, signal: signal?.toString() })

      // TODO: fix, hacky
      if (procName === 'node') {
        if (this.shutdownResolve) {
          this.shutdownResolve()
        }
        this.cleanup()
      }

      this.logger.log(`${this.config.name}:${procName}:exit`, {
        code,
        signal: signal?.toString(),
      })
    })

    return
  }

  /**
   * Kills all child processes and handles any required cleanup
   */
  private cleanup(): void {
    this.logger.log(`cleaning up ${this.config.name}...`)
    // TODO: at this point you know the node proc is dead, should we remove from map?
    this.procs.forEach((proc) => {
      // TODO: handle proc.kill?
      const _ = proc.kill()
    })
  }
}

/**
 * Public function to stop a node
 *
 * This is because you cannot access the actual SimulationNode object with the
 * running node/miner procs from other cli commands
 */
export async function stopSimulationNode(node: {
  name: string
  data_dir: string
  tcp_host: string
  tcp_port: number
}): Promise<{ success: boolean; msg: string }> {
  const client = new RpcTcpClient(node.tcp_host, node.tcp_port)

  try {
    const connectSuccess = await client.tryConnect()
    if (!connectSuccess) {
      throw new Error(`failed to connect to node ${node.name}`)
    }
  } catch (e) {
    globalLogger.log(`error creating client to connect to node ${node.name}: ${String(e)}`)
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
