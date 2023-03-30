/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// This file should serve as an example simulation.
// It is a good idea to copy this file and use it as a template for your own simulations.

import { Logger } from '@ironfish/sdk'
import {
  ErrorEvent,
  ExitEvent,
  IRON,
  LogEvent,
  SECOND,
  sendTransaction,
  SimulationNodeConfig,
  Simulator,
} from '../simulator'

/**
 * Author: <who wrote the simulation>
 * Date: <when was the simulation written>
 * Description: <what the simulation is doing>
 */

export async function run(logger: Logger): Promise<void> {
  // Create a new simulation handler.
  // The simulator handles managing nodes and data dirs.
  const simulator = new Simulator(logger)

  // Register event handlers.
  // These hooks will be called when a node logs, closes, exits, or errors.
  // This is useful when you want to validate certain behaviour, such as a node successfully exiting.

  // These sample handlers just log the event to the console.
  const onLog = (event: LogEvent): void => {
    logger.log(`[${event.node}:${event.proc}:log:${event.type}] ${JSON.stringify(event)}`)
  }

  const onExit = (event: ExitEvent): void => {
    logger.log(`[${event.node}:exit] ${JSON.stringify(event)}`)
  }

  const onError = (event: ErrorEvent): void => {
    logger.log(`[${event.node}:error] ${JSON.stringify(event)}`)
  }

  // Create the nodes in the simulation.
  // This will start the nodes and wait for them to initialize.
  // The handlers must be passed into the addNode function to ensure that no events are missed.
  const nodes = await Promise.all(
    nodeConfig.map(async (cfg) => {
      return simulator.startNode({
        cfg,
        onLog: [onLog],
        onExit: [onExit],
        onError: [onError],
      })
    }),
  )

  // This starts the miner on the first node.
  // The miner can also be stopped via `node[0].stopMiner()`
  nodes[0].startMiner()

  // Start the simulation.
  // You can write anything you want here.

  // The demo simulation will send a transaction every 3 seconds
  // and log how many transactions have been sent, how many have been confirmed, and how many have failed.

  const from = nodes[0]
  const to = nodes[0]

  const send = async (): Promise<void> => {
    const { hash } = await sendTransaction(from, to, 1 * IRON, 1 * IRON)
    const block = await from.waitForTransactionConfirmation(hash)

    if (!block) {
      logger.error(`[sim:failed] transaction: ${hash}`)
      return
    }
    logger.log(`[sim:confirmed] transaction: ${hash}, block: ${block.hash}`)
  }

  let started = 0
  let finished = 0

  setInterval(() => {
    started += 1
    const runNumber = started
    logger.log(`[started] #${runNumber}`)
    void send()
      .then(() => {
        finished += 1
        logger.log(`[finished] #${runNumber}`)
        logger.log(`[count] started ${started}, finished: ${finished}`)
      })
      .catch((e) => {
        logger.error(`[error] #${runNumber}: ${String(e)}`)
      })
  }, 3 * SECOND)

  // Call this to keep the simulation running. This currently will wait for all the nodes to exit.
  await simulator.waitForShutdown()
}

// Configuration for the nodes in the simulation
const nodeConfig: SimulationNodeConfig[] = [
  {
    nodeName: 'node1',
    blockGraffiti: '1',
    peerPort: 7001,
    dataDir: '~/.ironfish-atn/node1',
    networkId: 2,
    bootstrapNodes: ["''"], // This is a hack to register the bootstrap node
    rpcTcpHost: 'localhost',
    rpcTcpPort: 9001,
    verbose: true,
  },
  {
    nodeName: 'node2',
    blockGraffiti: '2',
    peerPort: 7002,
    dataDir: '~/.ironfish-atn/node2',
    networkId: 2,
    bootstrapNodes: ['localhost:7001'],
    rpcTcpHost: 'localhost',
    rpcTcpPort: 9002,
  },
  {
    nodeName: 'node3',
    blockGraffiti: '3',
    peerPort: 7003,
    dataDir: '~/.ironfish-atn/node3',
    networkId: 2,
    bootstrapNodes: ['localhost:7001'],
    rpcTcpHost: 'localhost',
    rpcTcpPort: 9003,
  },
]
