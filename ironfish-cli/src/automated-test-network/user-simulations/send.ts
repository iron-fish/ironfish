/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// User: holahula
// Purpose: Send transactions from one node to another every 3 seconds
import { Logger, Transaction } from '@ironfish/sdk'
import { startMiner, startNode } from '../node'
import { SimulationNodeConfig } from '../simulation-node'
import { Simulator } from '../simulator'
import { sendTransaction } from '../transactions'
import { IRON, SECOND, sleep } from '../utils'

export const simulation1 = async (logger: Logger): Promise<void> => {
  const simulator = new Simulator(logger)

  const nodes = await Promise.all(
    nodeConfig.map((cfg) => {
      return startNode(simulator, cfg)
    }),
  )

  logger = logger.withScope('simulation1')

  startMiner(nodes[0])

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
    void send().then(() => {
      finished += 1
      logger.log(`[finished] #${runNumber}`)
      logger.log(`[count] started ${started}, finished: ${finished}`)
    })
  }, 3 * SECOND)

  await simulator.waitForShutdown()

  // wait for all nodes to be stopped

  logger.log('nodes stopped, shutting down...')
}

export const nodeConfig: SimulationNodeConfig[] = [
  {
    name: 'node1',
    graffiti: '1',
    port: 7001,
    data_dir: '~/.ironfish-atn/node1',
    netword_id: 2,
    bootstrap_url: "''",
    tcp_host: 'localhost',
    tcp_port: 9001,
    // verbose: true,
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
