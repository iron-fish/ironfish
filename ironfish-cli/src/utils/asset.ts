/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { BufferUtils, CurrencyUtils, RpcClient } from '@ironfish/sdk'
import inquirer from 'inquirer'

export async function selectAsset(
  client: RpcClient,
  account: string | undefined,
  options: {
    action: string
    showNativeAsset: boolean
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
  const balancesResponse = await client.getAccountBalances({
    account: account,
    confirmations: options.confirmations,
  })

  let balances = balancesResponse.content.balances

  if (!options.showNativeAsset) {
    balances = balances.filter((b) => b.assetId !== Asset.nativeId().toString('hex'))
  }

  if (balances.length === 0) {
    return undefined
  }

  if (balances.length === 1 && !options.showSingleAssetChoice) {
    // If there's only one available asset, showing the choices is unnecessary
    return {
      id: balances[0].assetId,
      name: balances[0].assetName,
    }
  }

  const choices = balances.map((balance) => {
    const assetName = BufferUtils.toHuman(Buffer.from(balance.assetName, 'hex'))
    const name = `${balance.assetId} (${assetName}) (${CurrencyUtils.renderIron(
      balance.available,
    )})`

    const value = {
      id: balance.assetId,
      name: balance.assetName,
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
