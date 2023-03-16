/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { SimulationNode, SimulationNodeConfig } from './simulation-node'
import { Simulator } from './simulator'

export async function startNode(
  simulator: Simulator,
  config: SimulationNodeConfig,
): Promise<SimulationNode> {
  return simulator.addNode(config)
}

export async function stopNode(node: SimulationNode): Promise<void> {
  await node.stop()
}

export function startMiner(node: SimulationNode): boolean {
  return node.startMiner()
}

export function stopMiner(node: SimulationNode): boolean {
  return node.stopMiner()
}
