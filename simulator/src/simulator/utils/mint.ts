/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MintAssetRequest, MintAssetResponse } from '@ironfish/sdk'
import { SimulationNode } from '../simulation-node'
import { getDefaultAccount } from './accounts'

/**
 * Calls the mintAsset RPC on a node.
 */
export async function mintAsset(
  node: SimulationNode,
  request: MintAssetRequest,
): Promise<MintAssetResponse> {
  const resp = await node.client.wallet.mintAsset(request)

  if (resp.content === undefined) {
    throw new Error(`error minting asset`)
  }

  return resp.content
}

/**
 * Mints an existing asset using the mintAsset RPC call.
 */
export async function mintExistingAsset(
  node: SimulationNode,
  request: {
    fee: string
    value: string
    assetId: string
  },
  options?: {
    expiration?: number
    confirmations?: number
  },
): Promise<MintAssetResponse> {
  const account = await getDefaultAccount(node)
  return mintAsset(node, { account: account, ...request, ...options })
}

export async function mintNewAsset(
  node: SimulationNode,
  request: {
    fee: string
    value: string
    name: string
    metadata?: string
  },
  options?: {
    expiration?: number
    confirmations?: number
  },
): Promise<MintAssetResponse> {
  const account = await getDefaultAccount(node)
  return mintAsset(node, { account: account, ...request, ...options })
}
