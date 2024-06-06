/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { CurrencyUtils } from '../../../utils'
import { RpcAsset, RpcAssetSchema } from '../chain'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { getAccount } from './utils'

export type GetAssetsRequest = {
  account?: string
  confirmations?: number
}

export type GetAssetsResponse = RpcAsset

export const GetAssetsRequestSchema: yup.ObjectSchema<GetAssetsRequest> = yup
  .object()
  .shape({
    account: yup.string(),
    confirmations: yup.number().optional(),
  })
  .defined()

export const GetAssetsResponseSchema: yup.ObjectSchema<GetAssetsResponse> =
  RpcAssetSchema.defined()

routes.register<typeof GetAssetsRequestSchema, GetAssetsResponse>(
  `${ApiNamespace.wallet}/getAssets`,
  GetAssetsRequestSchema,
  async (request, node): Promise<void> => {
    AssertHasRpcContext(request, node, 'wallet', 'assetsVerifier')

    const account = getAccount(node.wallet, request.data.account)

    for await (const asset of account.getAssets()) {
      if (request.closed) {
        break
      }

      request.stream({
        id: asset.id.toString('hex'),
        metadata: asset.metadata.toString('hex'),
        name: asset.name.toString('hex'),
        creator: asset.creator.toString('hex'),
        owner: asset.owner.toString('hex'),
        nonce: asset.nonce,
        status: await node.wallet.getAssetStatus(account, asset, {
          confirmations: request.data.confirmations,
        }),
        supply: asset.supply !== null ? CurrencyUtils.encode(asset.supply) : undefined,
        createdTransactionHash: asset.createdTransactionHash.toString('hex'),
        verification: node.assetsVerifier.verify(asset.id),
      })
    }

    request.end()
  },
)
