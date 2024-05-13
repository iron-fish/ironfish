/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import {
  BufferUtils,
  CurrencyUtils,
  RPC_ERROR_CODES,
  RpcAsset,
  RpcAssetVerification,
  RpcClient,
  RpcRequestError,
  StringUtils,
} from '@ironfish/sdk'
import chalk from 'chalk'
import inquirer from 'inquirer'

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

export async function selectAsset(
  client: Pick<RpcClient, 'wallet'>,
  account: string | undefined,
  options: {
    action: string
    showNativeAsset: boolean
    showNonCreatorAsset: boolean
    showSingleAssetChoice: boolean
    filter?: (asset: RpcAsset) => boolean
    confirmations?: number
  },
): Promise<
  | {
      id: string
      name: string
    }
  | undefined
> {
  const balancesResponse = await client.wallet.getAccountBalances({
    account: account,
    confirmations: options.confirmations,
  })

  let balances = balancesResponse.content.balances

  const assetLookup = await getAssetsByIDs(
    client,
    balances.map((b) => b.assetId),
    account,
    options.confirmations,
  )
  if (!options.showNativeAsset) {
    balances = balances.filter((b) => b.assetId !== Asset.nativeId().toString('hex'))
  }

  if (!options.showNonCreatorAsset) {
    const accountResponse = await client.wallet.getAccountPublicKey({
      account: account,
    })

    balances = balances.filter(
      (b) => assetLookup[b.assetId].creator === accountResponse.content.publicKey,
    )
  }

  if (balances.length === 0) {
    return undefined
  }

  if (balances.length === 1 && !options.showSingleAssetChoice) {
    // If there's only one available asset, showing the choices is unnecessary
    return {
      id: balances[0].assetId,
      name: assetLookup[balances[0].assetId].name,
    }
  }

  const filter = options.filter
  if (filter) {
    balances = balances.filter((balance) => filter(assetLookup[balance.assetId]))
  }

  const choices = balances.map((balance) => {
    const assetName = BufferUtils.toHuman(Buffer.from(assetLookup[balance.assetId].name, 'hex'))

    const renderedAvailable = CurrencyUtils.render(
      balance.available,
      false,
      balance.assetId,
      assetLookup[balance.assetId].verification,
    )
    const name = `${balance.assetId} (${assetName}) (${renderedAvailable})`

    const value = {
      id: balance.assetId,
      name: assetLookup[balance.assetId].name,
    }

    return { value, name }
  })

  const response = await inquirer.prompt<{
    asset: {
      id: string
      name: string
    }
  }>([
    {
      name: 'asset',
      message: `Select the asset you wish to ${options.action}`,
      type: 'list',
      choices,
    },
  ])

  return response.asset
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
