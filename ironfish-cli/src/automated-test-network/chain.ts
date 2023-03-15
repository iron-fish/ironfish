/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ChainInfo } from '@ironfish/sdk'
import { SimulationNode } from './simulation-node'

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export async function getChainInfo(node: SimulationNode): Promise<ChainInfo> {
  const resp = await node.client.getChainInfo()

  return resp.content
}

export async function getLatestBlockHash(node: SimulationNode): Promise<string> {
  const { currentBlockIdentifier } = await getChainInfo(node)

  return currentBlockIdentifier.hash
}
