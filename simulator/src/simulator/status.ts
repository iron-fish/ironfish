/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GetNodeStatusResponse } from '@ironfish/sdk'
import { SimulationNode } from './simulation-node'

export async function getNodeStatus(node: SimulationNode): Promise<GetNodeStatusResponse> {
  const resp = await node.client.getNodeStatus()

  return resp.content
}
