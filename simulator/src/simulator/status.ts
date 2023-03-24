/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { FileUtils, GetNodeStatusResponse } from '@ironfish/sdk'
import { SimulationNode } from './simulation-node'

export async function getNodeStatus(node: SimulationNode): Promise<GetNodeStatusResponse> {
  const resp = await node.client.getNodeStatus()

  return resp.content
}

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
