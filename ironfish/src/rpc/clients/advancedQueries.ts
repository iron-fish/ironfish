/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../assert'
import { RpcAsset, RpcWalletTransaction } from '../routes'
import { RpcClient } from './client'

/*
 * This file contains queries that aggregate data across multiple RPC endpoints.
 */

export async function allAccountsByAddress(
  client: Pick<RpcClient, 'wallet'>,
): Promise<Map<string, string>> {
  const allAccounts = (await client.wallet.getAccounts()).content.accounts
  return new Map<string, string>(
    await Promise.all(
      allAccounts.map<Promise<[string, string]>>(async (account) => {
        const response = await client.wallet.getAccountPublicKey({ account })
        return [response.content.publicKey, response.content.account]
      }),
    ),
  )
}

export async function* getTransactionsWithAssets(
  client: Pick<RpcClient, 'wallet'>,
  accounts: string[],
  hash?: string,
  sequence?: number,
  limit?: number,
  offset?: number,
  confirmations?: number,
  notes?: boolean,
): AsyncGenerator<
  {
    account: string
    transaction: RpcWalletTransaction
    assetLookup: { [key: string]: RpcAsset }
  },
  void
> {
  for (const account of accounts) {
    const response = client.wallet.getAccountTransactionsStream({
      account,
      hash,
      sequence,
      limit,
      offset,
      confirmations,
      notes,
    })

    for await (const transaction of response.contentStream()) {
      if (notes) {
        Assert.isNotUndefined(transaction.notes)

        const assetLookup = await getAssetsByIDs(
          client,
          transaction.notes.map((n) => n.assetId) || [],
          account,
          confirmations,
        )

        yield { account, transaction, assetLookup }
      } else {
        const assetLookup = await getAssetsByIDs(
          client,
          transaction.assetBalanceDeltas.map((d) => d.assetId),
          account,
          confirmations,
        )

        yield { account, transaction, assetLookup }
      }
    }
  }
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
