/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger, Logger } from '@ironfish/sdk'
import {
  IRON,
  SECOND,
  sendTransaction,
  SimulationNodeConfig,
  Simulator,
} from '../../automated-test-network'
import { IronfishCommand } from '../../command'

/**
 * TODOs
 * - send transactions around
 * - support mempool sizing in config
 * - don't print out all the logs, just the important stuff
 *   - add command to tail logs for a specific node
 */

export default class Start extends IronfishCommand {
  static description = 'Start the test network'

  async start(): Promise<void> {
    const logger = createRootLogger()
    await this.sdk.connectRpc()

    const simulator = new Simulator({ name: 'simulation orchestrator' }, logger)

    const nodes = await Promise.all(
      nodeConfig.map((cfg) => {
        return simulator.addNode(cfg)
      }),
    )

    logger.log('nodes initialized')

    // Run simulation here

    const send = async (count: number, logger: Logger): Promise<void> => {
      const from = nodes[0]
      const to = nodes[2]

      logger.log(`${count} [start]: start send from ${from.config.name} to ${to.config.name}`)

      // const preFromBalance = await getAccountBalance(from, await getDefaultAccount(from))
      // const preToBalance = await getAccountBalance(to, await getDefaultAccount(to))

      // logger.log(`${count}: setup done for send from ${from.config.name} to ${to.config.name}`)

      // action
      const txnFee = 1 * IRON
      const { amount, hash } = await sendTransaction(from, to, {
        spendLimit: 2 * IRON,
        fee: txnFee,
        spendType: 'random',
      })

      logger.log(
        `${count} [sent]: sent ${amount} from ${from.config.name} to ${to.config.name} with hash ${hash}`,
      )

      // Is there a race condition if the transaction gets confirmed right away?
      const block = await simulator.waitForTransactionConfirmation(count, from, hash)
      if (!block) {
        throw new Error('transaction not confirmed')
      }

      logger.log(
        `${count} [confirmed]: transaction ${hash} confirmed in block ${block.sequence} ${block.hash}`,
      )

      // validation
      /**
       * notes:
       * - mining is happening in the background so that can impact balances
       * - multiple transactions are inflight at once
       */

      // const postFromBalance = await getAccountBalance(from, await getDefaultAccount(from))
      // const postToBalance = await getAccountBalance(to, await getDefaultAccount(to))

      // // TODO(austin): fix validation, very hacky
      // const toEquals = preFromBalance - amount - txnFee === postFromBalance
      // if (!toEquals) {
      //   console.log(
      //     `${count}: from balance failed validation: ${preFromBalance} - ${amount} - ${txnFee}
      //     expected: ${preFromBalance - amount - txnFee}
      //     got: ${postFromBalance}`,
      //   )
      // }

      // Assert.isEqual(
      //   preToBalance + amount,
      //   postToBalance,
      //   `${count}: to balance failed validation: ${preToBalance} + ${amount}
      //   expected: ${preToBalance + amount}
      //   got: ${postToBalance}`,
      // )

      // logger.log(
      //   `${count}: validated ${amount} from ${from.config.name} to ${to.config.name} with hash ${hash}`,
      // )
    }

    let count = 0
    let done = 0
    const interval = setInterval(() => {
      count++
      void send(count, logger)
        .catch((e) => {
          logger.log(`[err]: ${String(e)}`)
        })
        .then(() => {
          done++
          logger.log(`txns done: ${done}`)
        })
    }, 3 * SECOND)

    simulator.addTimer(interval)

    // block: wait for all nodes to be stopped
    try {
      await simulator.waitForShutdown()
    } catch (e) {
      logger.log(`node shutdown error: ${String(e)}`)
    }

    logger.log('nodes stopped')

    logger.log('cleaning up')

    logger.log('shutting down...')
  }
}

export const nodeConfig: SimulationNodeConfig[] = [
  {
    name: 'node1',
    graffiti: '1',
    port: 7001,
    data_dir: '~/.ironfish-atn/node1',
    netword_id: 2,
    is_miner: true,
    bootstrap_url: "''",
    tcp_host: 'localhost',
    tcp_port: 9001,
    http_host: 'localhost',
    http_port: 8001,
  },
  {
    name: 'node2',
    graffiti: '2',
    port: 7002,
    data_dir: '~/.ironfish-atn/node2',
    netword_id: 2,
    bootstrap_url: 'localhost:7001',
    tcp_host: 'localhost',
    tcp_port: 9002,
    http_host: 'localhost',
    http_port: 8002,
  },
  {
    name: 'node3',
    graffiti: '3',
    port: 7003,
    data_dir: '~/.ironfish-atn/node3',
    netword_id: 2,
    bootstrap_url: 'localhost:7001',
    tcp_host: 'localhost',
    tcp_port: 9003,
    http_host: 'localhost',
    http_port: 8003,
  },
]
