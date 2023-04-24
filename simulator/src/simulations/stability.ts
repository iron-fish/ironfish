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
  Simulator,
  sleep,
} from '../simulator'

// Author: holahula
// Date: 2023-03-28
// Description:
// This simulation tests the stability of the network by randomly stopping and starting nodes,
// trying to see if nodes crash over time. The memory usage of the nodes is also monitored.

export async function run(simulator: Simulator, logger: Logger): Promise<void> {
  const alive: Set<string> = new Set()

  const onExit = (event: ExitEvent): void => {
    logger.log(`[${event.node}:exit] ${JSON.stringify(event)}`)
  }

  const onError = (event: ErrorEvent): void => {
    logger.log(`[${event.node}:error] ${JSON.stringify(event)}`)
  }

  // Spawn 3 nodes
  for (let i = 0; i < 3; i++) {
    const node = await simulator.startNode({
      onExit: [onExit],
      onError: [onError],
    })
    alive.add(node.config.nodeName)
  }

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

  void stopLoop(simulator, logger, alive, loop, simulationStatus)

  void startLoop(simulator, logger, alive, loop, simulationStatus, {
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

      const added = await simulator.startNode(options)
      logger.log(`[start] starting node ${added.config.nodeName}`)

      alive.add(added.config.nodeName)

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
