/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ASSET_ID_LENGTH } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { CurrencyUtils } from '../../../utils'
import { RpcNotFoundError, RpcValidationError } from '../../adapters'
import { RpcAsset, RpcAssetSchema } from '../chain/types'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { getAccount } from './utils'

export type GetWalletAssetRequest = {
  account?: string
  confirmations?: number
  id: string
}

export type GetWalletAssetResponse = RpcAsset

export const GetWalletAssetRequestSchema: yup.ObjectSchema<GetWalletAssetRequest> = yup
  .object()
  .shape({
    account: yup.string().optional(),
    confirmations: yup.number().optional(),
    id: yup.string(),
  })
  .defined()

export const GetWalletAssetResponse: yup.ObjectSchema<GetWalletAssetResponse> =
  RpcAssetSchema.defined()

routes.register<typeof GetWalletAssetRequestSchema, GetWalletAssetResponse>(
  `${ApiNamespace.wallet}/getAsset`,
  GetWalletAssetRequestSchema,
  async (request, node): Promise<void> => {
    AssertHasRpcContext(request, node, 'wallet', 'assetsVerifier')

    const account = getAccount(node.wallet, request.data.account)

    const id = Buffer.from(request.data.id, 'hex')
    if (id.byteLength !== ASSET_ID_LENGTH) {
      throw new RpcValidationError(
        `Asset identifier is invalid length, expected ${ASSET_ID_LENGTH} but got ${id.byteLength}`,
      )
    }

    const asset = await account.getAsset(id)
    if (!asset) {
      throw new RpcNotFoundError(`No asset found with identifier ${request.data.id}`)
    }

    request.end({
      createdTransactionHash: asset.createdTransactionHash.toString('hex'),
      creator: asset.creator.toString('hex'),
      owner: asset.owner.toString('hex'),
      id: asset.id.toString('hex'),
      metadata: asset.metadata.toString('hex'),
      name: asset.name.toString('hex'),
      nonce: asset.nonce,
      status: await node.wallet.getAssetStatus(account, asset, {
        confirmations: request.data.confirmations,
      }),
      supply: asset.supply ? CurrencyUtils.encode(asset.supply) : undefined,
      verification: node.assetsVerifier.verify(asset.id),
    })
  },
)
