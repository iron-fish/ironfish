/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConfigOptions, Logger } from '@ironfish/sdk'
import { randomUUID } from 'crypto'
import { mkdirSync, rmSync } from 'fs'
import { homedir } from 'os'
import { exit } from 'process'
import { ErrorEvent, ExitEvent, LogEvent, logEventToString } from './events'
import { SECOND, sleep } from './misc'
import {
  OptionalSimulationNodeConfig,
  SimulationNode,
  SimulationNodeConfig,
} from './simulation-node'
import { getNodeMemoryStatus } from './utils/status'
/**
 * The simulator orchestrates the running simulation.
 * It owns all the nodes and can start and stop them.
 * It can also provide statistics about the network or the nodes themselves.
 */
export class Simulator {
  logger: Logger

  /** The ID of the simulation */
  simulationID = randomUUID()

  /** Map of all running nodes from node name to SimulationNode */
  nodes: Map<string, SimulationNode> = new Map()

  /** Whether the simulator is currently running */
  running = false

  /** Whether to persist the data directories of the nodes after simulator shutdown */
  persistNodeDataDirs = false

  /** Log all node event to the logger by default */
  verboseLogging = false

  /** Set of all data directories of the spawned nodes */
  dataDirs: Set<string> = new Set<string>()

  basePeerPort = 7000
  baseRpcHttpPort = 8000
  baseRpcTcpPort = 9000

  /** The node that will be used to bootstrap the network.
   * This is currently the first node started by the Simulator.
   */
  bootstrapNode: string | undefined = undefined

  /** Number of nodes that have been started */
  nodeCount = 0

  constructor(
    logger: Logger,
    options?: { persist?: boolean; duration?: number; verboseLogging?: boolean },
  ) {
    this.logger = logger
    this.logger.withTag('simulator')

    this.running = true
    this.verboseLogging = !!options?.verboseLogging
    this.persistNodeDataDirs = !!options?.persist

    if (options?.duration !== undefined) {
      const duration = options.duration
      this.logger.log(`this simulation will run for ${duration} seconds`)
      const exitTimeout = setTimeout(() => {
        this.logger.log(`simulator exiting after ${duration} seconds`)
        clearTimeout(exitTimeout)
        this.exit()
      }, options.duration * SECOND)
    }

    mkdirSync(`${homedir()}/.ironfish-simulator/simulations/${this.simulationID}`, {
      recursive: true,
    })

    this.logger.log(`created sim directory at ${this.tmpdir()}`)

    process.on('SIGINT' || 'SIGKILL', (event) => {
      this.logger.log(`simulator handled ${event.toString()}`)
      this.exit(1)
    })
  }

  /**
   * Adds a simulation node to the network.
   *
   * This node runs in a separate process and is killed when the simulator is shut down.
   *
   * @param config config of node to add to the orchestrator
   */
  async startNode(options?: {
    cfg?: Partial<ConfigOptions & OptionalSimulationNodeConfig>
    onLog?: ((l: LogEvent) => void | Promise<void>)[]
    onExit?: ((e: ExitEvent) => void | Promise<void>)[]
    onError?: ((c: ErrorEvent) => void | Promise<void>)[]
  }): Promise<SimulationNode> {
    this.nodeCount += 1
    if (this.verboseLogging) {
      options = {
        ...options,
        onLog: [
          ...(options?.onLog || []),
          (l) => {
            const log = logEventToString(l)
            if (log) {
              this.logger.log(log)
            }
          },
        ],
      }
    }

    // Only log tags that the user chooses to log
    // TODO: this is a bit hacky, if the user creates new log handlers after node creation they won't be filtered
    if (options?.cfg?.logTags) {
      const toLog = options?.cfg?.logTags
      const filteredOnLogs = []

      for (const onLog of options?.onLog || []) {
        const filtered = (l: LogEvent) => {
          const tags = l.jsonMessage?.tag.split(':')
          const includes = tags?.some((t) => toLog.includes(t))

          if (includes) {
            return onLog(l)
          }
        }

        filteredOnLogs.push(filtered)
      }

      options.onLog = filteredOnLogs
    }

    const nodeConfig = this.fillConfig(options?.cfg ?? {})

    this.logger.log('Starting node', { cfg: JSON.stringify(nodeConfig) })
    const node = await SimulationNode.init(nodeConfig, this.logger, {
      ...options,
    })

    this.nodes.set(nodeConfig.nodeName, node)
    this.dataDirs.add(nodeConfig.dataDir)
    return node
  }

  /**
   *  Stops a node and removes it from the network.
   * @param nodeName name of node to stop
   * @returns success of stopping the node, and attached message
   */
  async stopNode(nodeName: string): Promise<{ success: boolean; msg: string }> {
    const node = this.nodes.get(nodeName)
    if (!node) {
      throw new Error(`Node ${nodeName} is not running`)
    }

    const { success, msg } = await node.stop()
    if (!success) {
      throw new Error(msg)
    }

    this.nodes.delete(nodeName)

    return { success, msg }
  }

  /**
   * Starts a loop that checks the memory usage of all nodes.
   * Currently, the statistics are only logged to the console, but in the future
   * will be used to populate graphs or for watermark tests.
   *
   * @param durationMs duration between memory checks
   */
  async startMemoryUsageLoop(durationMs: number): Promise<void> {
    while (this.running) {
      await sleep(durationMs)

      this.logger.log(`[memory] checking memory usage`)
      for (const node of this.nodes.values()) {
        const memory = await getNodeMemoryStatus(node, true)
        this.logger.log(`[${node.config.nodeName}]`, { memoryStatus: JSON.stringify(memory) })
      }
    }
  }

  /**
   * Unexpected process exit handler.
   * This deletes all data directories, kills all nodes, and exits the Simulator process.
   */
  public exit(code = 0): void {
    this.nodes.forEach((node) => node.kill())
    this.deleteDataDirs()
    this.logger.log('exiting...')
    exit(code)
  }

  /**
   * Wait for all nodes to shutdown.
   *
   * Currently nodes can only be remotely shut down via the `simulator stop` command.
   */
  async waitForShutdown(): Promise<void> {
    this.logger.log('simulator waiting for shutdown...')

    await Promise.all(Array.from(this.nodes.values()).map((node) => node.waitForShutdown()))

    return this.cleanup()
  }

  /**
   * Cleans up the simulator.
   */
  private async cleanup(): Promise<void> {
    this.running = false

    // Wait for any running loops to stop
    await sleep(3 * SECOND)

    this.deleteDataDirs()
    this.nodes.clear()
  }

  /**
   * Deletes the data directories of all nodes used in the simulation.
   * This is only called when the simulator is shutting down, and is not called
   * when a node is stopped. Data directories can be persisted by passing the
   * `--persist` flag to the simulator.
   */
  public deleteDataDirs(): void {
    if (!this.persistNodeDataDirs) {
      this.logger.log('cleaning up data dirs')
      this.dataDirs.forEach((dir) => {
        if (dir[0] === '~') {
          dir = dir.replace('~', process.env.HOME || homedir())
        }
        this.logger.log(`removing data dir: ${dir}`)
        rmSync(dir, { recursive: true, force: true })
      })
    }
  }

  /**
   * Fills in any missing config options that are required for the simulation node to start
   *
   * @param config Optional config set by the user
   * @returns Config with required defaults filled in
   */
  fillConfig(
    config?: Partial<ConfigOptions & OptionalSimulationNodeConfig>,
  ): SimulationNodeConfig {
    if (!config) {
      config = {}
    }

    config.nodeName = config.nodeName || `node-${randomUUID().slice(0, 4)}`

    // The first node to be started will be the bootstrap node.
    // TODO: Allow multiple bootstrap nodes
    if (!config.bootstrapNodes) {
      config.bootstrapNodes = []
      if (this.bootstrapNode) {
        config.bootstrapNodes.push(`${this.bootstrapNode}`)
      } else {
        config.bootstrapNodes.push("''")
        this.bootstrapNode = `localhost:${config.peerPort || this.basePeerPort + 1}`
      }
    }

    return {
      nodeName: config.nodeName,
      blockGraffiti: config.blockGraffiti || config.nodeName,
      peerPort: config.peerPort || this.basePeerPort + this.nodeCount,
      networkId: config.networkId || 2,
      rpcTcpHost: config.rpcTcpHost || 'localhost',
      rpcTcpPort: config.rpcTcpPort || this.baseRpcTcpPort + this.nodeCount,
      rpcHttpHost: config.rpcHttpHost || 'localhost',
      rpcHttpPort: config.rpcHttpPort || this.baseRpcHttpPort + this.nodeCount,
      bootstrapNodes: config.bootstrapNodes,
      dataDir: config.dataDir || `~/.ironfish-simulator/${config.nodeName}`,
      verbose: config.verbose || false,
      importGenesisAccount: config.importGenesisAccount || true,
      ...config,
    }
  }

  /**
   * Returns the path to the temporary directory for this simulation. This path can be used to store
   * temporary files related to the simulation, including any user or simulation generated files.
   *
   * @returns the path to the temporary directory for this simulation
   */
  public tmpdir(): string {
    return `${homedir()}/.ironfish-simulator/simulations/${this.simulationID}`
  }
}
