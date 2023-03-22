/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PromiseUtils, RpcSocketClient, RpcTcpClient } from '@ironfish/sdk'
import { Logger } from '@ironfish/sdk'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
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
  client: RpcTcpClient
  config: SimulationNodeConfig

  running: boolean
  private shutdownPromise: Promise<void>
  private shutdownResolve: () => void
  private lastProcessError?: Error

  private logger: Logger
  private nodeProcess: ChildProcessWithoutNullStreams

  private minerProcess?: ChildProcessWithoutNullStreams

  private constructor(config: SimulationNodeConfig, client: RpcTcpClient, logger: Logger) {
    this.config = config
    this.client = client
    this.logger = logger.withTag(`${config.name}`)
    const [promise, resolve] = PromiseUtils.split<void>()
    this.shutdownResolve = resolve
    this.shutdownPromise = promise

    const args = [
      `start`,
      `--name ${config.name}`,
      `--graffiti ${config.graffiti}`,
      `--port ${config.port.toString()}`,
      `--datadir ${config.data_dir}`,
      `--networkId ${config.netword_id.toString()}`,
      `--bootstrap ${config.bootstrap_url}`,
      '--rpc.tcp',
      `--rpc.tcp.host ${config.tcp_host}`,
      `--rpc.tcp.port ${config.tcp_port.toString()}`,
      '--no-rpc.tcp.tls',
      config.verbose ? '--verbose' : '',
      ' --forceMining',
    ]

    logger.log(rootCmd + ' ' + args.join(' '))

    this.nodeProcess = spawn('ironfish', args)
    this.running = true

    this.nodeProcess.stdout.on('data', (data) => {
      const str = (data as Buffer).toString('ascii')
      this.logger.withTag(`stdout`).log(`${str}`)
    })

    this.nodeProcess.stderr.on('data', (data) => {
      const str = (data as Buffer).toString('ascii')
      this.logger.withTag(`${config.name}:stderr`).log(`${str}`)
    })

    this.nodeProcess.on('error', (error: Error) => {
      this.lastProcessError = error
      this.logger.withTag(`error`).log(`${error.message}`)
    })

    // TODO: not sure this event is even needed
    this.nodeProcess.on('close', (code: number | null) => {
      this.logger.withTag(`close`).log(`child process exited`, {
        ...(code ? { code } : {}),
      })
    })

    this.nodeProcess.on('exit', (code, signal) => {
      // TODO: add other cleanup tasks here\
      this.running = false
      this.minerProcess?.kill()
      this.minerProcess = undefined

      this.shutdownResolve()

      this.logger.withTag(`exit`).log('exited: ', {
        ...(code ? { code } : {}),
        ...(signal ? { signal: signal?.toString() } : {}),
        ...(this.lastProcessError ? { lastError: this.lastProcessError?.toString() } : {}),
      })
    })
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

    await SimulationNode.waitForClientConnect(client)

    if (!client) {
      throw Error('client failed to connect to running process')
    }

    return node
  }

  private static async waitForClientConnect(
    client: RpcSocketClient,
    retries = 12,
  ): Promise<RpcTcpClient | null> {
    let connected = false
    let tries = 0
    while (!connected && tries < retries) {
      connected = await client.tryConnect()
      tries++
      await sleep(250)
    }

    if (!connected) {
      return null
    }

    return client
  }

  /**
   *
   * Starts and attaches a miner process to the simulation node
   */
  public startMiner(): void {
    if (this.minerProcess) {
      return
    }

    this.logger.log(`attaching miner to ${this.config.name}...`)

    this.minerProcess = spawn('ironfish', [
      'miners:start',
      '-t',
      '1',
      '--datadir',
      this.config.data_dir,
    ])

    this.minerProcess.stdout.on('data', (data) => {
      const str = (data as Buffer).toString('ascii')
      this.logger.withTag(`miner:stdout`).log(`${str}`)
    })

    this.minerProcess.stderr.on('data', (data) => {
      const str = (data as Buffer).toString('ascii')
      this.logger.withTag(`miner:stderr`).log(`${str}`)
    })

    this.minerProcess.on('error', (error: Error) => {
      this.logger.withTag(`miner:error`).log(`${error.message}`)
    })

    // TODO: not sure this event is even needed
    this.minerProcess.on('close', (code: number | null) => {
      this.logger.withTag(`miner:close`).log(`miner process exited`, {
        ...(code ? { code } : {}),
      })
    })

    this.minerProcess.on('exit', (code, signal) => {
      this.minerProcess = undefined

      this.logger.withTag(`miner:exit`).log('miner exited: ', {
        ...(code ? { code } : {}),
        ...(signal ? { signal: signal?.toString() } : {}),
      })
    })
  }

  /**
   * Stops and detaches the miner process from the node. This can be called at any time during the simulation
   * if you would like to stop mining.
   *
   * @returns Whether the miner was successfully detached
   */
  public stopMiner(): boolean {
    if (!this.minerProcess) {
      return true
    }

    this.logger.log(`detaching miner from ${this.config.name}...`)

    const success = this.minerProcess.kill()

    this.minerProcess = undefined

    return success
  }

  async waitForShutdown(): Promise<void> {
    await this.shutdownPromise
  }

  async stop(): Promise<{ success: boolean; msg: string }> {
    this.logger.log(`killing node ${this.config.name}...`)

    return stopSimulationNode({ logger: this.logger, ...this.config })
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
  logger: Logger
}): Promise<{ success: boolean; msg: string }> {
  const client = new RpcTcpClient(node.tcp_host, node.tcp_port)

  try {
    const connectSuccess = await client.tryConnect()
    if (!connectSuccess) {
      throw new Error(`failed to connect to node ${node.name}`)
    }
  } catch (e) {
    node.logger.log(`error creating client to connect to node ${node.name}: ${String(e)}`)
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
