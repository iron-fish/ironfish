/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// User: holahula
// Purpose: Send transactions from one node to another every 3 seconds
import { Logger, Transaction } from '@ironfish/sdk'
import { SimulationNodeConfig } from '../simulator/simulation-node'
import { Simulator } from '../simulator/simulator'
import { sendTransaction } from '../simulator/transactions'
import { IRON, SECOND, sleep } from '../simulator/utils'

export async function run(logger: Logger): Promise<void> {
  const simulator = new Simulator(logger)

  const nodes = await Promise.all(
    nodeConfig.map(async (cfg) => {
      return simulator.addNode(cfg)
    }),
  )

  // How to listen to logs from a specific node
  nodes[0].onLog.on((log) => {
    const tag = 'peermanager'
    if (log.tag.includes(tag)) {
      // TODO(austin): clean up the log output to remove the unicode characters
      logger.withTag(`${nodes[0].config.name}`).warn(`tag found: ${tag}: ${log.args}`)
    }
  })

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
      logger.log(`[sent] transaction: ${hash}, nullifier: ${nullifier}`)
    }

    const block = await from.waitForTransactionConfirmation(hash)

    if (!block) {
      logger.error(`[failed] transaction: ${hash}`)
      return
    }
    logger.log(`[confirmed] transaction: ${hash}, block: ${block.hash}`)
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

  await simulator.waitForShutdown()

  // wait for all nodes to be stopped

  logger.log('nodes stopped, shutting down...')
}

const nodeConfig: SimulationNodeConfig[] = [
  {
    name: 'node1',
    graffiti: '1',
    port: 7001,
    data_dir: '~/.ironfish-atn/node1',
    netword_id: 2,
    bootstrap_url: "''",
    tcp_host: 'localhost',
    tcp_port: 9001,
    verbose: true,
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
  },
]
