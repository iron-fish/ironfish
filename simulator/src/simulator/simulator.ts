/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '@ironfish/sdk'
import {
  ErrorEvent,
  ExitEvent,
  LogEvent,
  SimulationNode,
  SimulationNodeConfig,
} from './simulation-node'
import { getNodeMemoryStatus } from './status'
import { sleep } from './utils'

/**
 * The simulator orchestrates the running simulation.
 * It owns all the nodes and can start and stop them.
 * It can also provide statistics about the network or the nodes themselves.
 */
export class Simulator {
  logger: Logger

  nodes: Map<string, SimulationNode> = new Map()

  running = false

  constructor(logger: Logger) {
    this.logger = logger
    this.logger.withTag('simulator')

    this.running = true
  }

  /**
   * Adds a simulation node to the network.
   *
   * This node runs in a separate process and is killed when the simulator is shut down.
   *
   * @param config config of node to add to the orchestrator
   */
  async startNode(
    config: SimulationNodeConfig,
    options?: {
      onLog?: ((l: LogEvent) => void | Promise<void>)[]
      onExit?: ((e: ExitEvent) => void | Promise<void>)[]
      onError?: ((c: ErrorEvent) => void | Promise<void>)[]
    },
  ): Promise<SimulationNode> {
    const node = await SimulationNode.initialize(config, this.logger, options)

    this.nodes.set(config.nodeName, node)

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
   * Wait for all nodes to shutdown.
   *
   * Currently nodes can only be shutdown via the `atn stop` command.
   */
  async waitForShutdown(): Promise<void> {
    await Promise.all(Array.from(this.nodes.values()).map((node) => node.waitForShutdown()))

    return this.cleanup()
  }

  private async cleanup(): Promise<void> {
    this.running = false
    await sleep(3000)

    // Clear the nodes
    this.nodes.clear()
  }
}
