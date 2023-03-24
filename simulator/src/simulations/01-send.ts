/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// User: holahula
// Purpose: Send transactions from one node to another every 3 seconds
import { Logger, Transaction } from '@ironfish/sdk'
import {
  ErrorEvent,
  ExitEvent,
  IRON,
  LogEvent,
  SECOND,
  sendTransaction,
  SimulationNodeConfig,
  Simulator,
  sleep,
} from '../simulator'

export async function run(logger: Logger): Promise<void> {
  const simulator = new Simulator(logger)

  // Register event handlers

  const onLog = (event: LogEvent): void => {
    logger.log(`[${event.node}:${event.proc}:log:${event.type}] ${JSON.stringify(event)}`)
  }

  const onExit = (event: ExitEvent): void => {
    logger.log(`[${event.node}:exit] ${JSON.stringify(event)}`)
  }

  const onError = (event: ErrorEvent): void => {
    logger.log(`[${event.node}:error] ${JSON.stringify(event)}`)
  }

  const nodes = await Promise.all(
    nodeConfig.map(async (cfg) => {
      return simulator.addNode(cfg, {
        onLog: [onLog],
        onExit: [onExit],
        onError: [onError],
      })
    }),
  )

  /**
   * TODO:
   * run chaos monkey that randomly stops nodes on intervals
   * can you detect when a node is killed and see it
   *
   * simulation1 can be stability
   * - do nodes crash over time
   * - whats the high watermark of the node (memory leak test)
   *  - peak usage (record memory usage in intervals)
   * - can also set limit in test, if a node goes over it should print a failure
   *  - then can investigate to find cause
   *
   * print mac spinner while test is running so you know it's alive
   *
   * problem with logs is that if there's too many, it's useless
   */
  logger = logger.withScope('simulation1')

  nodes[0].startMiner()

  // TODO: hack to wait for nodes finish initializing
  await sleep(5 * SECOND)

  logger.log('nodes initialized')

  const nullifiers: { [key: string]: number } = {}
  const from = nodes[0]
  const to = nodes[0]

  const send = async (): Promise<void> => {
    const { transaction, hash } = await sendTransaction(from, to, 1 * IRON, 1 * IRON)
    const t = new Transaction(Buffer.from(transaction, 'hex'))
    for (const s of t.spends) {
      const nullifier = s.nullifier.toString('hex')
      nullifiers[nullifier] ? nullifiers[nullifier]++ : (nullifiers[nullifier] = 1)
      logger.log(`[sim:sent] transaction: ${hash}, nullifier: ${nullifier}`)
    }

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
  }, 1 * SECOND)

  await simulator.waitForShutdown()

  // wait for all nodes to be stopped

  logger.log('nodes stopped, shutting down...')
}

const nodeConfig: SimulationNodeConfig[] = [
  {
    nodeName: 'node1',
    blockGraffiti: '1',
    peerPort: 7001,
    dataDir: '~/.ironfish-atn/node1',
    networkId: 2,
    bootstrapNodes: ["''"],
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
