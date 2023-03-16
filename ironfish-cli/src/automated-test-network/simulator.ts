/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FollowChainStreamResponse, Logger, Stream } from '@ironfish/sdk'
import { getLatestBlockHash } from './chain'
import { SimulationNode, SimulationNodeConfig } from './simulation-node'
import { waitForTransactionConfirmation } from './transactions'
import { sleep } from './utils'

export type SimulatorConfig = {
  name: string
}

export class Simulator {
  config: SimulatorConfig
  logger: Logger

  nodes: Map<string, SimulationNode> = new Map()

  // map from node name to stream
  blockStreams: Map<string, AsyncGenerator<FollowChainStreamResponse, void, unknown>> =
    new Map()

  blockStreamConsumers: Map<string, Stream<FollowChainStreamResponse>[]> = new Map()

  intervals: NodeJS.Timer[] = []

  constructor(config: SimulatorConfig, logger: Logger) {
    this.config = config
    this.logger = logger
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

    // Void this call to not wait on it (?)
    void this.setBlockStream(node, await getLatestBlockHash(node))

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
   * Add a user simulation to the simulator.
   * TODO: Need a good way to indicate to user to call this after defining their simulation.
   *
   * @param timer timer to add to the list of timers to clear when the simulator is shut down
   */
  addTimer(timer: NodeJS.Timer): void {
    this.intervals.push(timer)
  }

  private async cleanup(): Promise<void> {
    await sleep(3000)

    // Clear the intervals
    this.intervals.forEach((interval) => clearInterval(interval))
    this.intervals = []

    // Clear the block streams
    // TODO(austin): add functionality to stop the block stream
    this.blockStreams.clear()
    this.blockStreamConsumers.clear()

    // Clear the nodes
    this.nodes.clear()
  }

  async waitForTransactionConfirmation(
    count: number,
    node: SimulationNode,
    transactionHash: string,
  ): Promise<FollowChainStreamResponse['block'] | undefined> {
    const blockStream = this.attachBlockStreamConsumer(node)

    const block = await waitForTransactionConfirmation(count, transactionHash, blockStream)

    this.detachBlockStreamConsumer(node, blockStream)

    return block
  }

  /**
   * eee
   */
  async setBlockStream(node: SimulationNode, startingBlockHash: string): Promise<void> {
    const blockStream = node.client
      .followChainStream({ head: startingBlockHash.toString() })
      .contentStream()

    this.blockStreams.set(node.config.name, blockStream)
    this.blockStreamConsumers.set(node.config.name, [])

    for await (const block of blockStream) {
      console.log(`got block ${block.block.hash} from ${node.config.name}`)
      let txns = ''
      block.block.transactions.forEach((txn) => (txns += ' | ' + txn.hash.toLowerCase()))
      console.log(`with txns${txns}`)
      const consumers = this.blockStreamConsumers.get(node.config.name)
      if (!consumers) {
        continue
      }

      consumers.forEach((consumer) => consumer.write(block))
    }
  }

  attachBlockStreamConsumer(node: SimulationNode): Stream<FollowChainStreamResponse> {
    const blockStream = this.blockStreams.get(node.config.name)

    if (!blockStream) {
      throw new Error('Block stream not found')
    }
    const stream: Stream<FollowChainStreamResponse> = new Stream()

    const consumers = this.blockStreamConsumers.get(node.config.name)
    if (!consumers) {
      throw new Error('Block stream consumers not found during attaching')
    }

    consumers.push(stream)

    return stream
  }

  detachBlockStreamConsumer(
    node: SimulationNode,
    stream: Stream<FollowChainStreamResponse>,
  ): void {
    const consumers = this.blockStreamConsumers.get(node.config.name)
    if (!consumers) {
      throw new Error('Block stream consumers not found when detaching')
    }

    consumers.filter((consumer) => consumer !== stream)
  }
}
