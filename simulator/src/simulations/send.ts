/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger } from '@ironfish/sdk'
import chalk from 'chalk'
import { IRON, SECOND, sendTransaction, SimulationNode, Simulator, sleep } from '../simulator'

// Author: holahula
// Purpose: Send transactions from one node to another every 3 seconds

export async function run(simulator: Simulator, logger: Logger): Promise<void> {
  const nodes = []
  for (let i = 0; i < 2; i++) {
    nodes.push(await simulator.startNode())
  }

  void sendLoop(simulator, logger, nodes)

  // wait for all nodes to be stopped
  await simulator.waitForShutdown()

  logger.log('nodes stopped, shutting down...')
}

async function sendLoop(simulator: Simulator, logger: Logger, nodes: SimulationNode[]) {
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
}
