/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger } from '@ironfish/sdk'
import { MINUTE, SimulationNodeConfig, Simulator, sleep } from '../simulator'

export async function run(logger: Logger): Promise<void> {
  const simulator = new Simulator(logger)

  const alive: Map<string, boolean> = new Map()
  const dead: Map<string, boolean> = new Map()

  const nodes = await Promise.all(
    nodeConfig.slice(0, 3).map(async (cfg) => {
      const node = simulator.addNode(cfg)
      alive.set(cfg.name, true)
      return node
    }),
  )

  nodes.forEach((node) => {
    const name = node.config.name
    if (!alive.has(name)) {
      dead.set(name, true)
    }
  })

  logger = logger.withScope('simulation2')
  logger.log('lol')

  nodes[0].onLog.on((log) => {
    logger.log(`${nodes[0].config.name}: ${JSON.stringify(log)}`)
  })

  nodes[0].startMiner()

  await sleep(3000)

  // tear down nodes
  setRandomInterval(
    () => {
      logger.log('stop node')
    },
    2 * MINUTE,
    3 * MINUTE,
  )

  // spawn new nodes
  const lol = setRandomInterval(
    () => {
      logger.log('start node')
    },
    2 * MINUTE,
    3 * MINUTE,
  )

  lol.clear()

  // status check
  setInterval(() => {
    logger.log('status check')
  }, 5 * MINUTE)

  await simulator.waitForShutdown()
}

const setRandomInterval = (
  intervalFunction: () => void,
  minDelay: number, // in ms
  maxDelay: number, // in ms
) => {
  let timeout: NodeJS.Timeout

  const runInterval = () => {
    const timeoutFunction = () => {
      intervalFunction()
      runInterval()
    }

    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay

    timeout = setTimeout(timeoutFunction, delay)
  }

  runInterval()

  return {
    clear() {
      clearTimeout(timeout)
    },
  }
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
  {
    name: 'node4',
    graffiti: '4',
    port: 7004,
    data_dir: '~/.ironfish-atn/node4',
    netword_id: 2,
    bootstrap_url: 'localhost:7001',
    tcp_host: 'localhost',
    tcp_port: 9004,
  },
  {
    name: 'node5',
    graffiti: '5',
    port: 7005,
    data_dir: '~/.ironfish-atn/node5',
    netword_id: 2,
    bootstrap_url: 'localhost:7001',
    tcp_host: 'localhost',
    tcp_port: 9005,
  },
]
