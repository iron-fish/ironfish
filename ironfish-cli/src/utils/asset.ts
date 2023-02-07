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
): Promise<string | undefined> {
  const balancesResponse = await client.getAccountBalances({
    account: account,
    confirmations: options.confirmations,
  })
  const assetOptions = []

  let balances = balancesResponse.content.balances

  if (!options.showNativeAsset) {
    balances = balances.filter(
      (balance) => balance.assetId !== Asset.nativeId().toString('hex'),
    )
  }

  if (balances.length === 0) {
    return undefined
  } else if (balances.length === 1 && !options.showSingleAssetChoice) {
    // If there's only one available asset, showing the choices is unnecessary
    return balances[0].assetId
  }

  // Get the asset name from the chain DB to populate the display choices
  for (const { assetId, confirmed } of balances) {
    const assetResponse = await client.getAsset({ id: assetId })

    if (assetResponse.content.name) {
      const displayName = BufferUtils.toHuman(Buffer.from(assetResponse.content.name, 'hex'))
      assetOptions.push({
        value: assetId,
        name: `${assetId} (${displayName}) (${CurrencyUtils.renderIron(confirmed)})`,
      })
    }
  }

  const response: { assetId: string } = await inquirer.prompt<{ assetId: string }>([
    {
      name: 'assetId',
      message: `Select the asset you wish to ${options.action}`,
      type: 'list',
      choices: assetOptions,
    },
  ])
  return response.assetId
}
