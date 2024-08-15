/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  RPC_ERROR_CODES,
  RpcAsset,
  RpcAssetVerification,
  RpcClient,
  RpcRequestError,
  StringUtils,
} from '@ironfish/sdk'
import chalk from 'chalk'

type RenderAssetNameOptions = {
  verification?: RpcAssetVerification
  outputType?: string
}

export function renderAssetWithVerificationStatus(
  name: string,
  options?: RenderAssetNameOptions,
): string {
  if (options?.outputType) {
    // User requested some machine-readable output (like CSV, JSON, or YAML).
    // Do not alter the name in any way.
    return name
  }

  name = StringUtils.sanitizeString(name)

  switch (options?.verification?.status) {
    case 'verified':
      return chalk.green(name + '✓')
    case 'unknown':
      return chalk.yellow(name + '?')
    default:
      return name
  }
}

export function compareAssets(
  leftName: string,
  leftVerification: RpcAssetVerification,
  rightName: string,
  rightVerification: RpcAssetVerification,
): number {
  const isLeftVerified = leftVerification?.status === 'verified'
  const isRightVerified = rightVerification?.status === 'verified'
  // Sort by verified status first, then by name
  if (isLeftVerified && !isRightVerified) {
    return -1
  }
  if (!isLeftVerified && isRightVerified) {
    return 1
  }
  if (leftName < rightName) {
    return -1
  }
  if (leftName > rightName) {
    return 1
  }
  return 0
}

export async function getAssetVerificationByIds(
  client: Pick<RpcClient, 'wallet'>,
  assetIds: string[],
  account: string | undefined,
  confirmations: number | undefined,
): Promise<{ [key: string]: RpcAssetVerification }> {
  assetIds = [...new Set(assetIds)]
  const assets = await Promise.all(
    assetIds.map((id) =>
      client.wallet.getAsset({ id, account, confirmations }).catch((e) => {
        if (e instanceof RpcRequestError && e.code === RPC_ERROR_CODES.NOT_FOUND.valueOf()) {
          return undefined
        } else {
          throw e
        }
      }),
    ),
  )
  const assetLookup: { [key: string]: RpcAssetVerification } = {}
  assets.forEach((asset) => {
    if (asset) {
      assetLookup[asset.content.id] = asset.content.verification
    }
  })
  return assetLookup
}

export async function getAssetsByIDs(
  client: Pick<RpcClient, 'wallet'>,
  assetIds: string[],
  account: string | undefined,
  confirmations: number | undefined,
): Promise<{ [key: string]: RpcAsset }> {
  assetIds = [...new Set(assetIds)]
  const assets = await Promise.all(
    assetIds.map((id) => client.wallet.getAsset({ id, account, confirmations })),
  )
  const assetLookup: { [key: string]: RpcAsset } = {}
  assets.forEach((asset) => {
    assetLookup[asset.content.id] = asset.content
  })
  return assetLookup
}
