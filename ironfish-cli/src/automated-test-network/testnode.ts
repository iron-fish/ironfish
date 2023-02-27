/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, Loggable, RpcTcpClient } from '@ironfish/sdk'
import { createRootLogger, Logger } from '@ironfish/sdk'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { exec } from 'child_process'
import util from 'util'
import { second, sleep } from './utils'

export const rootCmd = 'ironfish'

type TestNodeConfig = {
  name: string
  graffiti: string
  port: number
  data_dir: string
  netword_id: number
  is_miner?: boolean
  bootstrap_url: string
  tcp_host: string
  tcp_port: number
}

export class TestNode {
  procs = new Map<string, ChildProcessWithoutNullStreams>()
  nodeProcess: ChildProcessWithoutNullStreams
  minerProcess?: ChildProcessWithoutNullStreams

  client: RpcTcpClient | null

  name: string
  graffiti: string
  port: number
  data_dir: string
  netword_id: number
  is_miner: boolean
  bootstrap_url: string
  tcp_host: string
  tcp_port: number

  shutdownPromise: Promise<void> | null = null
  shutdownResolve: (() => void) | null = null

  logger: Logger

  constructor(config: TestNodeConfig, logger?: Logger) {
    this.name = config.name
    this.graffiti = config.graffiti
    this.port = config.port
    this.data_dir = config.data_dir
    this.netword_id = config.netword_id
    this.is_miner = config.is_miner || false
    this.bootstrap_url = config.bootstrap_url
    this.tcp_host = config.tcp_host
    this.tcp_port = config.tcp_port

    this.client = null

    this.logger = logger || createRootLogger()

    // this is gross fix this
    let args =
      'start --name ' +
      config.name +
      ' --graffiti ' +
      config.graffiti +
      ' --port ' +
      config.port.toString() +
      ' --datadir ' +
      config.data_dir +
      ' --networkId ' +
      config.netword_id.toString() +
      ' --bootstrap ' +
      config.bootstrap_url +
      ' --rpc.tcp' +
      ' --rpc.tcp.host ' +
      config.tcp_host +
      ' --rpc.tcp.port ' +
      config.tcp_port.toString() +
      ' --no-rpc.tcp.tls'
    //  +' --jsonLogs'

    /**
     * TODO: eventually should give the ATF it's own HTTP server to export miner logs
     */
    if (config.is_miner) {
      args += ' --forceMining'
      this.attachMiner()
    }

    this.nodeProcess = this.startNodeProcess(args)

    this.logger.log(`started node: ${this.name}`)
  }

  registerChildProcess(proc: ChildProcessWithoutNullStreams, procName: string): void {
    this.attachListeners(proc, procName)
    this.procs.set(procName, proc)
  }

  /**
   *
   * attaches a miner process to the test node
   */
  attachMiner(): void {
    this.logger.log(`attaching miner to ${this.name}...`)

    this.minerProcess = spawn('ironfish', [
      'miners:start',
      '-t',
      '1',
      '--datadir',
      this.data_dir,
    ])
    this.registerChildProcess(this.minerProcess, 'miner')

    return
  }

  async attachClient(): Promise<void> {
    this.client = new RpcTcpClient(this.tcp_host, this.tcp_port)
    try {
      const success = await this.client.tryConnect()
      if (!success) {
        throw new Error(`failed to connect to node ${this.name}`)
      }
    } catch (e) {
      this.logger.log(`error creating client to connect to node ${this.name}: ${String(e)}`)
      this.client = null
    }

    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject()
      }
      resolve()
    })
  }

  static async initialize(config: TestNodeConfig, logger?: Logger): Promise<TestNode> {
    const node = new TestNode(config, logger)
    await sleep(3 * second)
    await node.attachClient()

    node.shutdownPromise = new Promise((resolve) => (node.shutdownResolve = resolve))

    Assert.isNotNull(node.client)
    Assert.isTrue(node.client.isConnected, 'client is not connected')
    return node
  }

  startNodeProcess(args: string): ChildProcessWithoutNullStreams {
    this.logger.log(rootCmd + ' ' + args)
    const nodeProc = spawn(rootCmd, args.split(' '))
    this.registerChildProcess(nodeProc, 'node')

    return nodeProc
  }

  async waitForShutdown(): Promise<void> {
    await this.shutdownPromise
  }

  async stop(): Promise<{ success: boolean; msg: string }> {
    this.logger.log(`killing node ${this.name}...`)

    return stopTestNode(this)
  }

  /**
   * Adds listeners to the input/output streams for a new proc.
   * Currently this just connects your process to this.logger.log
   *
   * @param proc new proc
   */
  attachListeners(p: ChildProcessWithoutNullStreams, procName: string): void {
    p.stdout.on('data', (data) => {
      const str = (data as Buffer).toString()
      this.logger.log(`[${this.name}:${procName}:stdout]`, { str })
    })

    p.stderr.on('data', (data) => {
      const str = (data as Buffer).toString()
      this.logger.log(`[${this.name}:${procName}:stderr]`, { str })
    })

    p.on('error', (error: Error) => {
      const msg = error.message
      this.logger.log(`[${this.name}:${procName}:error]:`, { msg })
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

      this.logger.log(`[${this.name}:${procName}:exit]:spawn`, {
        code,
        signal: signal?.toString(),
      })
    })

    p.on('close', (code: number | null) => {
      this.logger.log(`[${this.name}:${procName}:close]: child process exited`, { code })
    })

    return
  }

  /**
   * Kills all child processes and handles any required cleanup
   */
  cleanup(): void {
    this.logger.log(`cleaning up ${this.name}...`)
    // TODO: at this point you know the node proc is dead, should we remove from map?
    this.procs.forEach((proc) => {
      // TODO: handle proc.kill?
      const _ = proc.kill()
    })
  }
}

/**
 * public function to stop a node
 * this is because you can't access the actual TestNode object with the
 * running node/miner procs from other cli commands
 */
export async function stopTestNode(node: {
  name: string
  data_dir: string
  is_miner?: boolean
  tcp_host: string
  tcp_port: number
}): Promise<{ success: boolean; msg: string }> {
  return stopViaTcp(node)
}

// option to stop via CLI instead RPC client
async function stopViaExec(node: {
  name: string
  data_dir: string
  is_miner?: boolean
  tcp_host: string
  tcp_port: number
}): Promise<{ success: boolean; msg: string }> {
  console.log(`killing node ${node.name}...`)

  const execPromise = util.promisify(exec)

  const { stdout, stderr } = await execPromise(`${rootCmd} stop --datadir ${node.data_dir}`)
  let success = true
  let msg = stdout

  if (stderr) {
    success = false
    msg = stderr
  }

  return { success, msg }
}

async function stopViaTcp(node: {
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
    console.log(`error creating client to connect to node ${node.name}: ${String(e)}`)
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

  console.log(node.name, success, msg)
  return { success, msg }
}
