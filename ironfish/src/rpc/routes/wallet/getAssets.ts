/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { AssetVerification } from '../../../assets'
import { CurrencyUtils } from '../../../utils'
import { ApiNamespace, routes } from '../router'
import { getAccount } from './utils'

export type GetAssetsRequest = {
  account?: string
  confirmations?: number
}

export type GetAssetsResponse = {
  createdTransactionHash: string
  id: string
  metadata: string
  name: string
  creator: string
  owner: string
  nonce: number
  status: string
  supply?: string
  verification: AssetVerification
}

export const GetAssetsRequestSchema: yup.ObjectSchema<GetAssetsRequest> = yup
  .object()
  .shape({
    account: yup.string(),
    confirmations: yup.number().optional(),
  })
  .defined()

export const GetAssetsResponseSchema: yup.ObjectSchema<GetAssetsResponse> = yup
  .object({
    createdTransactionHash: yup.string().defined(),
    id: yup.string().defined(),
    metadata: yup.string().defined(),
    name: yup.string().defined(),
    creator: yup.string().defined(),
    owner: yup.string().defined(),
    status: yup.string().defined(),
    nonce: yup.number().defined(),
    supply: yup.string().optional(),
    verification: yup
      .object({ status: yup.string().oneOf(['verified', 'unverified', 'unknown']).defined() })
      .defined(),
  })
  .defined()

routes.register<typeof GetAssetsRequestSchema, GetAssetsResponse>(
  `${ApiNamespace.wallet}/getAssets`,
  GetAssetsRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node.wallet, request.data.account)

    for await (const asset of account.getAssets()) {
      if (request.closed) {
        break
      }

      request.stream({
        createdTransactionHash: asset.createdTransactionHash.toString('hex'),
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
        verification: node.assetsVerifier.verify(asset.id),
      })
    }

    request.end()
  },
)
