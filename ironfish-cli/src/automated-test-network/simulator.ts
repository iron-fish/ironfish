/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FollowChainStreamResponse, Logger } from '@ironfish/sdk'
import { SimulationNode, SimulationNodeConfig } from './simulation-node'
import { sendTransaction as send } from './transactions'
import { sleep } from './utils'

export type SimulatorConfig = {
  name: string
}

export class Simulator {
  config: SimulatorConfig
  logger: Logger

  nodes: Map<string, SimulationNode> = new Map()

  intervals: NodeJS.Timer[] = []

  constructor(config: SimulatorConfig, logger: Logger) {
    this.config = config
    this.logger = logger
  }

  /**
   * Adds a simulation node to the network.
   *
   * @param config config of node to add to the orchestrator
   */
  async addNode(config: SimulationNodeConfig): Promise<SimulationNode> {
    const node = await SimulationNode.initialize(config, this.logger)

    this.nodes.set(config.name, node)

    return node
  }

  async sendTransaction(cfg: {
    from: string
    to: string
    spendLimit: number // limit in ORE
    fee: number // fee in ORE
    spendType: 'flat' | 'random' // either spend a flat amount or a random amount from 1 to limit
  }): Promise<{ amount: number; hash: string }> {
    const fromNode = this.nodes.get(cfg.from)
    const toNode = this.nodes.get(cfg.to)

    if (!fromNode || !toNode) {
      throw new Error(`Either src / dest nodes are not in the network`)
    }

    return send(fromNode, toNode, cfg)
  }

  async waitForTransactionConfirmed(
    node: SimulationNode,
    transactionHash: string,
    startingBlockHash: string,
  ): Promise<FollowChainStreamResponse['block'] | undefined> {
    const blockStream = node.client
      .followChainStream({ head: startingBlockHash.toString() })
      .contentStream()

    for await (const { block, type } of blockStream) {
      // TODO(austin): why are we getting transactions as upper case from blocks?
      // other RPC calls return them as lower case elsewhere
      const hasTransation = block.transactions.find(
        (t) => t.hash.toLowerCase() === transactionHash,
      )

      if (type === 'connected' && hasTransation) {
        return block
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

  addTimer(timer: NodeJS.Timer): void {
    this.intervals.push(timer)
  }

  private async cleanup(): Promise<void> {
    await sleep(3000)
    this.intervals.forEach((interval) => clearInterval(interval))

    this.intervals = []
    this.nodes.clear()
  }
}
