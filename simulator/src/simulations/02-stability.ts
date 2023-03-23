/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger, PromiseUtils } from '@ironfish/sdk'
import {
  ErrorEvent,
  ExitEvent,
  LogEvent,
  MINUTE,
  SECOND,
  SimulationNode,
  SimulationNodeConfig,
  Simulator,
  sleep,
  stopSimulationNode,
} from '../simulator'

export async function run(logger: Logger): Promise<void> {
  const simulator = new Simulator(logger)

  const alive: Set<string> = new Set()
  const dead: Set<string> = new Set()

  const onLog = (event: LogEvent): void => {
    logger.log(`[${event.node}:${event.proc}:log:${event.type}] ${JSON.stringify(event)}`)
  }

  const onExit = (event: ExitEvent): void => {
    logger.log(`[${event.node}:exit] ${JSON.stringify(event)}`)
  }

  const onError = (event: ErrorEvent): void => {
    logger.log(`[${event.node}:error] ${JSON.stringify(event)}`)
  }

  const nodeMap: Map<string, SimulationNode> = new Map()

  const nodes = await Promise.all(
    nodeConfig.slice(0, 3).map(async (cfg) => {
      const node = await simulator.addNode(cfg, {
        onLog: [onLog],
        onExit: [onExit],
        onError: [onError],
      })
      alive.add(cfg.name)
      nodeMap.set(cfg.name, node)
      return node
    }),
  )

  nodeConfig.forEach((node) => {
    const name = node.name
    if (!alive.has(name)) {
      dead.add(name)
    }
  })

  logger = logger.withScope('simulation2')

  nodes[0].startMiner()

  await sleep(3000)

  const loop = {
    state: true,
  }

  const simulationStatus = {
    numStarts: 0,
    numStops: 0,
    failedStarts: [
      {
        err: Error,
      },
    ],
    failedStops: [
      {
        err: Error,
      },
    ],
  }

  void stopLoop(nodes, nodeMap, alive, dead, logger, loop)

  void startLoop(simulator, nodes, nodeMap, alive, dead, logger, loop, {
    onLog: [onLog],
    onExit: [onExit],
    onError: [onError],
  })

  // status check
  const status = setInterval(() => {
    logger.log('status check')
  }, 5 * MINUTE)

  await simulator.waitForShutdown()
}

// TODO: race condition between start / stop
const startLoop = async (
  simulator: Simulator,
  nodes: SimulationNode[],
  nodeMap: Map<string, SimulationNode>,
  alive: Set<string>,
  dead: Set<string>,
  logger: Logger,
  loop: { state: boolean },
  options?: {
    onLog?: ((event: LogEvent) => void)[]
    onExit?: ((event: ExitEvent) => void)[]
    onError?: ((event: ErrorEvent) => void)[]
  },
) => {
  while (loop.state) {
    await sleep(Math.floor(Math.random() * 30 * SECOND))
    const n = getRandomItem(dead)
    if (!n) {
      logger.log(`no dead node to spawn: ${Array.from(dead).join(', ')}}`)
      continue
    }

    logger.log(`starting node ${n}`)
    const node = nodeConfig.find((cfg) => cfg.name === n)
    if (!node) {
      logger.log(`couldnt get config for ${n}`)
      continue
    }

    const added = await simulator.addNode(node, options)
    alive.add(added.config.name)
    dead.delete(added.config.name)
    nodeMap.set(added.config.name, added)

    logger.log(`node ${added.config.name} started`)
  }
}

const getRandomItem = (set: Set<string>): string | undefined => {
  if (set.size === 0) {
    return undefined
  }
  const arr = Array.from(set)
  const idx = Math.floor(Math.random() * arr.length)
  return arr[idx]
}

// TODO: add exit handler exit loop
const stopLoop = async (
  nodes: SimulationNode[],
  nodeMap: Map<string, SimulationNode>,
  alive: Set<string>,
  dead: Set<string>,
  logger: Logger,
  loop: { state: boolean },
) => {
  while (loop.state) {
    await sleep(Math.floor(Math.random() * 30 * SECOND))
    if (alive.size === 1) {
      logger.log('cannot kill bootstrap node')
      continue
    }

    const name = getRandomItem(alive)
    if (!name) {
      logger.log('no alive node to kill', { alive: Array.from(alive).join(', ') })
      continue
    }

    const node = nodeMap.get(name)
    if (!node || node.config.bootstrap_url === "''") {
      logger.log(`alive node not found / cannot be killed ${name}`, {
        alive: Array.from(alive).join(', '),
      })
      continue
    }

    logger.log(`stopping node ${node.config.name}`)

    const [stopped, resolve, reject] = PromiseUtils.split<void>()

    const exitListener = () => {
      resolve()
    }

    const wait = setTimeout(() => {
      clearTimeout(wait)
      reject('timeout')
    }, 2 * MINUTE)

    node.onExit.on(exitListener)
    const { success, msg } = await stopSimulationNode(node.config)
    if (!success) {
      logger.log(msg)
    }

    await stopped.then(
      () => {
        alive.delete(node.config.name)
        dead.add(node.config.name)
        nodeMap.delete(node.config.name)

        logger.log(`node ${node.config.name} stopped`)
      },
      () => {
        logger.log(`node ${node.config.name} failed to stop`)
      },
    )

    node.onExit.off(exitListener)
  }
}

const setRandomInterval = (
  fn: () => void,
  minDelay: number, // in ms
  maxDelay: number, // in ms
) => {
  let timeout: NodeJS.Timeout

  const runInterval = () => {
    const timeoutFunction = () => {
      fn()
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
