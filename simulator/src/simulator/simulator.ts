/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '@ironfish/sdk'
import { SimulationNode, SimulationNodeConfig } from './simulation-node'
// import { SIMULATIONS } from './simulations'
import { sleep } from './utils'

export class Simulator {
  logger: Logger

  nodes: Map<string, SimulationNode> = new Map()
  intervals: NodeJS.Timer[] = []

  constructor(logger: Logger) {
    this.logger = logger
    this.logger.withTag('simulator')
  }

  /**
   * Adds a simulation node to the network.
   *
   * This node runs in a separate process and is killed when the simulator is shut down.
   *
   * @param config config of node to add to the orchestrator
   */
  async addNode(config: SimulationNodeConfig): Promise<SimulationNode> {
    const node = await SimulationNode.initialize(config, this.logger)

    this.nodes.set(config.name, node)

    return node
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

  /**
   * Adds a user simulation to track in the simulator.
   *
   * @param timer timer to add to the simulator
   */
  addTimer(timer: NodeJS.Timer): void {
    this.intervals.push(timer)
  }

  private async cleanup(): Promise<void> {
    await sleep(3000)

    // Clear the intervals
    this.intervals.forEach((interval) => clearInterval(interval))
    this.intervals = []

    // Clear the nodes
    this.nodes.clear()
  }
}
