/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Author: holahula
// Purpose: Send transactions from one node to another every 3 seconds
import { Logger } from '@ironfish/sdk'
import chalk from 'chalk'
import {
  IRON,
  SECOND,
  sendTransaction,
  SimulationNodeConfig,
  Simulator,
  sleep,
} from '../simulator'

export async function run(logger: Logger): Promise<void> {
  const simulator = new Simulator(logger)

  const nodes = await Promise.all(nodeConfig.map((cfg) => simulator.startNode(cfg)))

  const from = nodes[0]
  const to = nodes[1]

  from.startMiner()

  while (simulator.nodes) {
    const sendResult = await sendTransaction(from, to, 1 * IRON, 1 * IRON).catch(
      () => undefined,
    )

    if (!sendResult) {
      continue
    }

    const { transaction, hash } = sendResult
    logger.log(chalk.yellow(`[SENT] ${hash}`))

    void to.waitForTransactionConfirmation(hash, transaction.expiration()).then((block) => {
      if (block === undefined) {
        logger.log(chalk.red(`[FAILED] ${hash}`))
      } else {
        logger.log(chalk.green(`[RECEIVED] ${hash} on block ${block?.sequence}`))
      }
    })

    await sleep(1 * SECOND)
  }

  // wait for all nodes to be stopped
  await simulator.waitForShutdown()

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
]
