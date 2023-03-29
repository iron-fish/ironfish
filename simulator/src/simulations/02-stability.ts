/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger, PromiseUtils } from '@ironfish/sdk'
import {
  ErrorEvent,
  ExitEvent,
  getRandom,
  LogEvent,
  MINUTE,
  SimulationNodeConfig,
  Simulator,
  sleep,
} from '../simulator'

// Author: holahula
// Date: 2023-03-28
// Description:
// This simulation tests the stability of the network by randomly stopping and starting nodes,
// trying to see if nodes crash over time. The memory usage of the nodes is also monitored.

export async function run(logger: Logger, options?: { persist: boolean }): Promise<void> {
  const simulator = new Simulator(logger, options)

  const alive: Set<string> = new Set()
  const dead: Set<string> = new Set()

  const onExit = (event: ExitEvent): void => {
    logger.log(`[${event.node}:exit] ${JSON.stringify(event)}`)
  }

  const onError = (event: ErrorEvent): void => {
    logger.log(`[${event.node}:error] ${JSON.stringify(event)}`)
  }

  // Spawn 3 nodes
  await Promise.all(
    nodeConfig.slice(0, 3).map(async (cfg) => {
      await simulator.startNode(cfg, {
        onExit: [onExit],
        onError: [onError],
      })
      alive.add(cfg.nodeName)
    }),
  )

  // add nodes to the alive / dead sets
  nodeConfig.forEach((node) => {
    const name = node.nodeName
    if (!alive.has(name)) {
      dead.add(name)
    }
  })

  logger = logger.withScope('simulation2')

  simulator.nodes.get('node0')?.startMiner()

  await sleep(3000)

  const loop = {
    state: true,
  }

  const simulationStatus: SimulationStatus = {
    numStarts: 0,
    numStops: 0,
    failedStarts: { count: 0, errs: [] },
    failedStops: { count: 0, errs: [] },
  }

  void stopLoop(simulator, logger, alive, dead, loop, simulationStatus)

  void startLoop(simulator, logger, alive, dead, loop, simulationStatus, {
    onExit: [onExit],
    onError: [onError],
  })

  void simulator.startMemoryUsageLoop(1 * MINUTE)

  setInterval(() => {
    logger.log('[simulation] sim status', { status: JSON.stringify(simulationStatus) })
  }, 1 * MINUTE)

  await simulator.waitForShutdown()
}

type SimulationStatus = {
  numStarts: number
  numStops: number
  failedStarts: { count: number; errs: Array<{ err: Error }> }
  failedStops: { count: number; errs: Array<{ err: Error }> }
}

// Loop that continuosly starts nodes
const startLoop = async (
  simulator: Simulator,
  logger: Logger,
  alive: Set<string>,
  dead: Set<string>,
  loop: { state: boolean },
  simulationStatus: SimulationStatus,
  options?: {
    onLog?: ((event: LogEvent) => void)[]
    onExit?: ((event: ExitEvent) => void)[]
    onError?: ((event: ErrorEvent) => void)[]
  },
) => {
  while (loop.state) {
    try {
      await sleep(Math.floor(Math.random() * 1 * MINUTE))
      const n = getRandom(dead)
      if (!n) {
        logger.log(`[start] no dead node to spawn: ${Array.from(dead).join(', ')}`)
        continue
      }

      logger.log(`[start] starting node ${n}`)
      const node = nodeConfig.find((cfg) => cfg.nodeName === n)
      if (!node) {
        logger.log(`[start] couldnt get config for ${n}`)
        continue
      }

      const added = await simulator.startNode(node, options)
      alive.add(added.config.nodeName)
      dead.delete(added.config.nodeName)

      simulationStatus.numStarts += 1

      logger.log(
        `[start] node ${added.config.nodeName} started | alive nodes: ${Array.from(alive).join(
          ', ',
        )}`,
      )
    } catch (e) {
      logger.log(`[start] error starting node`, { err: String(e) })
      simulationStatus.failedStarts.count += 1
      simulationStatus.failedStarts.errs.push({ err: new Error(String(e)) })
    }
  }
}

// Loop that continuously stops nodes
const stopLoop = async (
  simulator: Simulator,
  logger: Logger,
  alive: Set<string>,
  dead: Set<string>,
  loop: { state: boolean },
  simulationStatus: SimulationStatus,
) => {
  while (loop.state) {
    await sleep(Math.floor(Math.random() * 1 * MINUTE))
    if (alive.size === 1) {
      logger.log('[stop] only 1 node running, cannot kill bootstrap node')
      continue
    }

    const name = getRandom(alive)
    if (!name) {
      logger.log('[stop] no alive node to kill', { alive: Array.from(alive).join(', ') })
      continue
    }

    const node = simulator.nodes.get(name)
    if (!node) {
      logger.log(`[stop] alive node not found ${name}`, {
        alive: Array.from(alive).join(', '),
      })
      continue
    }

    if (node.config.bootstrapNodes[0] === "''") {
      logger.log(`[stop] bootstrap node cannot be killed ${name}`, {
        alive: Array.from(alive).join(', '),
      })
      continue
    }

    logger.log(`stopping node ${node.config.nodeName}`)

    simulationStatus.numStops += 1

    const [stopped, resolve, reject] = PromiseUtils.split<void>()

    const wait = setTimeout(() => {
      clearTimeout(wait)
      reject('[stop] timeout 1 minute exceeded')
    }, 1 * MINUTE)

    const exitListener = () => {
      resolve()
    }

    node.onExit.on(exitListener)

    const { success, msg } = await simulator.stopNode(node.config.nodeName)
    if (!success) {
      logger.log(msg)
    }

    await stopped.then(
      () => {
        alive.delete(node.config.nodeName)
        dead.add(node.config.nodeName)
        logger.log(
          `[stop] node ${node.config.nodeName} stopped | alive nodes: ${Array.from(alive).join(
            ', ',
          )}`,
        )
      },
      (reason) => {
        logger.log(`[stop] node ${node.config.nodeName} failed to stop`)
        simulationStatus.failedStops.errs.push({ err: new Error(reason) })
        simulationStatus.failedStops.count += 1
      },
    )

    node.onExit.off(exitListener)
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
