/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { FileUtils, GetNodeStatusResponse } from '@ironfish/sdk'
import { SimulationNode } from '../simulation-node'

/**
 * Gets the status of a node via the `getNodeStatus` RPC call
 * @param node node to get status of
 * @returns status of node
 */
export async function getNodeStatus(node: SimulationNode): Promise<GetNodeStatusResponse> {
  const resp = await node.client.node.getStatus()

  return resp.content
}

/**
 * Gets the memory status of a node
 *
 * @param node node to get memory status of
 * @param format whether to format the memory size to a readable string
 * @returns memory status of node
 */
export async function getNodeMemoryStatus(
  node: SimulationNode,
  format = false,
): Promise<
  | {
      heapMax: number
      heapTotal: number
      heapUsed: number
      rss: number
      memFree: number
      memTotal: number
    }
  | {
      heapMax: string
      heapTotal: string
      heapUsed: string
      rss: string
      memFree: string
      memTotal: string
    }
> {
  const { memory } = await getNodeStatus(node)

  if (!format) {
    return memory
  }

  const heapMax = FileUtils.formatMemorySize(memory.heapMax)
  const heapTotal = FileUtils.formatMemorySize(memory.heapTotal)
  const heapUsed = FileUtils.formatMemorySize(memory.heapUsed)
  const rss = FileUtils.formatMemorySize(memory.rss)
  const memFree = FileUtils.formatMemorySize(memory.memFree)
  const memTotal = FileUtils.formatMemorySize(memory.memTotal)

  return {
    heapMax,
    heapTotal,
    heapUsed,
    rss,
    memFree,
    memTotal,
  }
}
