/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GetAccountTransactionResponse, Logger } from '@ironfish/sdk'
import axios from 'axios'
import chalk from 'chalk'
import { IRON, SECOND, sendTransaction, SimulationNode, Simulator, sleep } from '../simulator'

// Author: hughy
// Purpose: Send transactions and ensure that they're available from
//          wallet/getAccountTransaction

const RPC_HTTP_PORT = 8020

export async function run(simulator: Simulator, logger: Logger): Promise<void> {
  const receiverNode = await simulator.startNode({
    cfg: { enableRpcHttp: true, rpcHttpHost: 'localhost', rpcHttpPort: RPC_HTTP_PORT },
  })

  for (let i = 1; i < 3; i++) {
    const senderRpcHttpPort = RPC_HTTP_PORT + i
    const senderNode = await simulator.startNode({
      cfg: {
        enableRpcHttp: true,
        rpcHttpHost: 'localhost',
        rpcHttpPort: senderRpcHttpPort,
        importGenesisAccount: false,
      },
    })
    void senderLoop(simulator, logger, senderNode, receiverNode, senderRpcHttpPort)
  }

  // wait for all nodes to be stopped
  await simulator.waitForShutdown()

  logger.log('nodes stopped, shutting down...')
}

async function senderLoop(
  simulator: Simulator,
  logger: Logger,
  from: SimulationNode,
  to: SimulationNode,
  senderRpcHttpPort: number,
) {
  const receiverEndpoint = `http://localhost:${RPC_HTTP_PORT}/wallet/getAccountTransaction`
  const senderEndpoint = `http://localhost:${senderRpcHttpPort}/wallet/getAccountTransaction`

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

    void getAccountTransaction(senderEndpoint, hash)

    void to.waitForTransactionConfirmation(hash, transaction.expiration()).then((block) => {
      if (block === undefined) {
        logger.log(chalk.red(`[FAILED] ${hash}`))
      } else {
        logger.log(chalk.green(`[RECEIVED] ${hash} on block ${block?.sequence}`))
      }

      void getAccountTransaction(receiverEndpoint, hash)
    })

    await sleep(1 * SECOND)
  }

  async function getAccountTransaction(endpointUrl: string, hash: string): Promise<void> {
    const httpResponse = await axios.post<GetAccountTransactionResponse>(endpointUrl, { hash })

    if (httpResponse.status !== 200) {
      logger.log(chalk.red(`[FAILED] request to ${endpointUrl}`))
    }

    if (httpResponse.data.transaction !== null) {
      logger.log(chalk.green(`[FOUND] transaction ${hash} at ${endpointUrl}`))
    } else {
      logger.log(chalk.red(`[NOT FOUND] transaction ${hash} not at ${endpointUrl}`))
    }
  }
}
