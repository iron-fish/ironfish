/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import {
  AssetVerification,
  BufferUtils,
  CurrencyUtils,
  RpcClient,
  StringUtils,
} from '@ironfish/sdk'
import chalk from 'chalk'
import inquirer from 'inquirer'

type RenderAssetNameOptions = {
  verification?: AssetVerification
  outputType?: string
  verbose?: boolean
  logWarn?: (msg: string) => void
}

export function renderAssetName(name: string, options?: RenderAssetNameOptions): string {
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
      if (options?.verbose && options?.logWarn) {
        options.logWarn(`Could not check whether ${name} is a verified asset`)
      }
      return name
    default:
      return name
  }
}

export function renderAssetNameFromHex(
  hexName: string,
  options?: RenderAssetNameOptions,
): string {
  const name = BufferUtils.toHuman(Buffer.from(hexName, 'hex'))
  return renderAssetName(name, options)
}

export function compareAssets(
  leftName: string,
  leftVerification: AssetVerification,
  rightName: string,
  rightVerification: AssetVerification,
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

  if (!options.showNativeAsset) {
    balances = balances.filter((b) => b.assetId !== Asset.nativeId().toString('hex'))
  }

  if (!options.showNonCreatorAsset) {
    const accountResponse = await client.wallet.getAccountPublicKey({
      account: account,
    })

    const filteredBalances = []
    for (const balance of balances) {
      const asset = await client.wallet.getAsset({
        id: balance.assetId,
      })
      if (asset.content.creator === accountResponse.content.publicKey) {
        filteredBalances.push(balance)
      }
    }

    balances = filteredBalances
  }

  if (balances.length === 0) {
    return undefined
  }

  if (balances.length === 1 && !options.showSingleAssetChoice) {
    // If there's only one available asset, showing the choices is unnecessary

    const asset = await client.wallet.getAsset({
      id: balances[0].assetId,
    })

    return {
      id: balances[0].assetId,
      name: asset.content.name,
    }
  }

  const choices = []

  for (const balance of balances) {
    const asset = await client.wallet.getAsset({
      id: balance.assetId,
    })
    const assetName = BufferUtils.toHuman(Buffer.from(asset.content.name, 'hex'))
    const name = `${balance.assetId} (${assetName}) (${CurrencyUtils.renderIron(
      balance.available,
    )})`
    const value = {
      id: balance.assetId,
      name: asset.content.name,
    }
    choices.push({ value, name })
  }

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
