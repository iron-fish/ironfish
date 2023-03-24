/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger, PromiseUtils } from '@ironfish/sdk'
import {
  ErrorEvent,
  ExitEvent,
  LogEvent,
  MINUTE,
  SimulationNode,
  SimulationNodeConfig,
  Simulator,
  sleep,
  stopSimulationNode,
} from '../simulator'
import { getNodeMemoryStatus } from '../simulator/status'

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

export async function run(logger: Logger): Promise<void> {
  const simulator = new Simulator(logger)

  const alive: Set<string> = new Set()
  const dead: Set<string> = new Set()

  const onExit = (event: ExitEvent): void => {
    logger.log(`[${event.node}:exit] ${JSON.stringify(event)}`)
  }

  const onError = (event: ErrorEvent): void => {
    logger.log(`[${event.node}:error] ${JSON.stringify(event)}`)
  }

  const nodeMap: Map<string, SimulationNode> = new Map()

  await Promise.all(
    nodeConfig.slice(0, 3).map(async (cfg) => {
      const node = await simulator.addNode(cfg, {
        onExit: [onExit],
        onError: [onError],
      })
      alive.add(cfg.nodeName)
      nodeMap.set(cfg.nodeName, node)
    }),
  )

  nodeConfig.forEach((node) => {
    const name = node.nodeName
    if (!alive.has(name)) {
      dead.add(name)
    }
  })

  logger = logger.withScope('simulation2')

  nodeMap.get('node0')?.startMiner()

  await sleep(3000)

  const loop = {
    state: true,
  }

  const simulationStatus: SimulationStatus = {
    numStarts: 0,
    numStops: 0,
    failedStarts: [],
    failedStops: [],
  }

  void stopLoop(nodeMap, alive, dead, logger, loop, simulationStatus)

  void startLoop(simulator, nodeMap, alive, dead, logger, loop, simulationStatus, {
    onExit: [onExit],
    onError: [onError],
  })

  void memoryLoop(nodeMap, logger, loop)

  setInterval(() => {
    logger.log('status', { status: JSON.stringify(simulationStatus) })
  }, 1 * MINUTE)

  await simulator.waitForShutdown()
}

type SimulationStatus = {
  numStarts: number
  numStops: number
  failedStarts: Array<{ err: Error }>
  failedStops: Array<{ err: Error }>
}

const memoryLoop = async (
  nodeMap: Map<string, SimulationNode>,
  logger: Logger,
  loop: { state: boolean },
) => {
  while (loop.state) {
    await sleep(1 * MINUTE)

    for (const node of nodeMap.values()) {
      const memory = await getNodeMemoryStatus(node, true)

      logger.log(`[${node.config.nodeName}]`, { memoryStatus: JSON.stringify(memory) })
    }
  }
}

const startLoop = async (
  simulator: Simulator,
  nodeMap: Map<string, SimulationNode>,
  alive: Set<string>,
  dead: Set<string>,
  logger: Logger,
  loop: { state: boolean },
  simulationStatus: SimulationStatus,
  options?: {
    onLog?: ((event: LogEvent) => void)[]
    onExit?: ((event: ExitEvent) => void)[]
    onError?: ((event: ErrorEvent) => void)[]
  },
) => {
  while (loop.state) {
    await sleep(Math.floor(Math.random() * 1 * MINUTE))
    const n = getRandomItem(dead)
    if (!n) {
      logger.log(`no dead node to spawn: ${Array.from(dead).join(', ')}`)
      continue
    }

    logger.log(`starting node ${n}`)
    const node = nodeConfig.find((cfg) => cfg.nodeName === n)
    if (!node) {
      logger.log(`couldnt get config for ${n}`)
      continue
    }

    const added = await simulator.addNode(node, options)
    alive.add(added.config.nodeName)
    dead.delete(added.config.nodeName)
    nodeMap.set(added.config.nodeName, added)

    simulationStatus.numStarts += 1

    logger.log(`node ${added.config.nodeName} started`)
    logger.log(`[start] alive nodes: ${Array.from(alive).join(', ')}`)
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
  nodeMap: Map<string, SimulationNode>,
  alive: Set<string>,
  dead: Set<string>,
  logger: Logger,
  loop: { state: boolean },
  simulationStatus: SimulationStatus,
) => {
  while (loop.state) {
    await sleep(Math.floor(Math.random() * 1 * MINUTE))
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
    if (!node || node.config.bootstrapNodes[0] === "''") {
      logger.log(`alive node not found / cannot be killed ${name}`, {
        alive: Array.from(alive).join(', '),
      })
      continue
    }

    logger.log(`stopping node ${node.config.nodeName}`)

    simulationStatus.numStops += 1

    const [stopped, resolve, reject] = PromiseUtils.split<void>()

    const exitListener = () => {
      resolve()
    }

    const wait = setTimeout(() => {
      clearTimeout(wait)
      reject('timeout')
    }, 1 * MINUTE)

    node.onExit.on(exitListener)
    const { success, msg } = await stopSimulationNode(node.config)
    if (!success) {
      logger.log(msg)
    }

    await stopped.then(
      () => {
        alive.delete(node.config.nodeName)
        dead.add(node.config.nodeName)
        nodeMap.delete(node.config.nodeName)

        logger.log(`node ${node.config.nodeName} stopped`)
      },
      (reason) => {
        logger.log(`node ${node.config.nodeName} failed to stop`)
        simulationStatus.failedStops.push({ err: new Error(reason) })
      },
    )

    node.onExit.off(exitListener)
    logger.log(`[stop] alive nodes: ${Array.from(alive).join(', ')}`)
  }
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
  {
    nodeName: 'node4',
    blockGraffiti: '4',
    peerPort: 7004,
    dataDir: '~/.ironfish-atn/node4',
    networkId: 2,
    bootstrapNodes: ['localhost:7001'],
    rpcTcpHost: 'localhost',
    rpcTcpPort: 9004,
  },
  {
    nodeName: 'node5',
    blockGraffiti: '5',
    peerPort: 7005,
    dataDir: '~/.ironfish-atn/node5',
    networkId: 2,
    bootstrapNodes: ['localhost:7001'],
    rpcTcpHost: 'localhost',
    rpcTcpPort: 9005,
  },
]
