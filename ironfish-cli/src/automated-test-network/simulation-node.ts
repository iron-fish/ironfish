/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RpcTcpClient } from '@ironfish/sdk'
import { createRootLogger, Logger } from '@ironfish/sdk'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { sleep } from './utils'

export const rootCmd = 'ironfish'

export type SimulationNodeConfig = {
  name: string
  graffiti: string
  port: number
  data_dir: string
  netword_id: number
  is_miner?: boolean
  bootstrap_url: string
  tcp_host: string
  tcp_port: number
  http_host: string
  http_port: number
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

  client: RpcTcpClient
  config: SimulationNodeConfig

  shutdownPromise: Promise<void> | null = null
  shutdownResolve: (() => void) | null = null

  logger: Logger

  ready = false

  constructor(config: SimulationNodeConfig, client: RpcTcpClient, logger?: Logger) {
    this.config = config

    this.client = client

    this.logger = logger || createRootLogger()

    // this is gross fix this
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
      ' --no-rpc.tcp.tls'
    //  +' --jsonLogs'

    /**
     * TODO: eventually should give the ATF it's own HTTP server to export miner logs
     */
    if (config.is_miner) {
      args += ' --forceMining'
      this.startMinerProcess()
    }

    this.nodeProcess = this.startNodeProcess(args)

    this.logger.log(`started node: ${this.config.name}`)
  }

  /**
   *
   * @param proc Adds a child process to the node and attaches any listeners.
   * @param procName The name of the process, used for logging and accessing the proc.
   */
  private registerChildProcess(proc: ChildProcessWithoutNullStreams, procName: string): void {
    this.attachListeners(proc, procName)
    this.procs.set(procName, proc)
  }

  /**
   *
   * Starts and attaches a miner process to the simulation node
   */
  private startMinerProcess(): void {
    this.logger.log(`attaching miner to ${this.config.name}...`)

    this.minerProcess = spawn('ironfish', [
      'miners:start',
      '-t',
      '1',
      '--datadir',
      this.config.data_dir,
    ])
    this.registerChildProcess(this.minerProcess, 'miner')
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
    this.registerChildProcess(nodeProc, 'node')

    return nodeProc
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
    logger?: Logger,
  ): Promise<SimulationNode> {
    const client = new RpcTcpClient(config.tcp_host, config.tcp_port)

    const node = new SimulationNode(config, client, logger)

    node.shutdownPromise = new Promise((resolve) => (node.shutdownResolve = resolve))

    // TODO: race condition, client connect should wait until node process is ready
    await sleep(3000)

    const success = await client.tryConnect()
    if (!success) {
      throw new Error(`failed to connect to node ${this.name}`)
    }

    node.ready = true

    return node
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
  private attachListeners(p: ChildProcessWithoutNullStreams, procName: string): void {
    const filtered = [
      'Requesting',
      // 'Successfully mined block',
      'Added block',
      'Starting sync from',
      'Found peer',
      'Finding ancestor',
      'Hashrate...',
      'Finished syncing',
    ]

    // const filtered = []

    p.stdout.on('data', (data) => {
      const str = (data as Buffer).toString()

      let log = true
      filtered.forEach((filter) => {
        if (str.startsWith(filter)) {
          log = false
        }
      })

      if (log) {
        this.logger.log(`[${this.config.name}:${procName}:stdout]`, { str })
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
        this.logger.log(`[${this.config.name}:${procName}:stderr]`, { str })
      }
    })

    p.on('error', (error: Error) => {
      const msg = error.message
      this.logger.log(`[${this.config.name}:${procName}:error]:`, { msg })
    })

    p.on('close', (code: number | null) => {
      this.logger.log(`[${this.config.name}:${procName}:close]: child process exited`, { code })
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

      this.logger.log(`[${this.config.name}:${procName}:exit]:spawn`, {
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
  is_miner?: boolean
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
