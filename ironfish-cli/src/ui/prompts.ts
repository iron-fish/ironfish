/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { BufferUtils, CurrencyUtils, RpcAsset, RpcClient } from '@ironfish/sdk'
import inquirer from 'inquirer'
import { getAssetsByIDs, renderAssetWithVerificationStatus } from '../utils'
import { listPrompt } from './prompt'

export async function accountPrompt(
  client: Pick<RpcClient, 'wallet'>,
  message: string = 'Select account',
): Promise<string> {
  const accountsResponse = await client.wallet.getAccounts()
  return listPrompt(message, accountsResponse.content.accounts, (a) => a)
}

export async function multisigAccountPrompt(
  client: Pick<RpcClient, 'wallet'>,
  message: string = 'Select multisig account',
): Promise<string> {
  const accountsResponse = await client.wallet.getAccounts()

  const accountIdentityPromises = accountsResponse.content.accounts.map((accountName) =>
    client.wallet.multisig
      .getAccountIdentity({ account: accountName })
      .then(() => accountName)
      .catch(() => undefined),
  )

  const multisigAccounts = (await Promise.all(accountIdentityPromises)).filter(
    (accountName): accountName is string => accountName !== undefined,
  )
  return listPrompt(message, multisigAccounts, (a) => a)
}

export async function multisigSecretPrompt(client: Pick<RpcClient, 'wallet'>): Promise<string> {
  const identitiesResponse = await client.wallet.multisig.getIdentities()

  const selection = await listPrompt(
    'Select participant secret name',
    identitiesResponse.content.identities,
    (i) => i.name,
  )

  return selection.name
}

export async function assetPrompt(
  client: Pick<RpcClient, 'wallet'>,
  account: string | undefined,
  options: {
    action: string
    showNativeAsset: boolean
    showNonCreatorAsset: boolean
    showSingleAssetChoice: boolean
    confirmations?: number
    filter?: (asset: RpcAsset) => boolean
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

  const filter = options.filter
  if (filter) {
    balances = balances.filter((balance) => filter(assetLookup[balance.assetId]))
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

  // Show verified assets at top of the list
  balances = balances.sort((asset1, asset2) => {
    const verified1 = assetLookup[asset1.assetId].verification.status === 'verified'
    const verified2 = assetLookup[asset2.assetId].verification.status === 'verified'
    if (verified1 && verified2) {
      return 0
    }

    return verified1 ? -1 : 1
  })

  const choices = balances.map((balance) => {
    const asset = assetLookup[balance.assetId]

    const assetName = BufferUtils.toHuman(Buffer.from(assetLookup[balance.assetId].name, 'hex'))
    const assetNameWithVerification = renderAssetWithVerificationStatus(assetName, asset)

    const renderedAvailable = CurrencyUtils.render(
      balance.available,
      false,
      balance.assetId,
      asset.verification,
    )

    const name = `${balance.assetId} (${assetNameWithVerification}) (${renderedAvailable})`

    const value = {
      id: balance.assetId,
      name: asset.name,
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
