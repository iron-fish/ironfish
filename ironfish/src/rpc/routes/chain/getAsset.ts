/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ASSET_ID_LENGTH } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { CurrencyUtils } from '../../../utils'
import { NotFoundError, ValidationError } from '../../adapters'
import { RpcAsset, RpcAssetSchema } from '../../types'
import { ApiNamespace, routes } from '../router'
import { getAccount } from '../wallet/utils'

export type GetAssetRequest = {
  id: string
}

export type GetAssetResponse = RpcAsset

export const GetAssetRequestSchema: yup.ObjectSchema<GetAssetRequest> = yup
  .object()
  .shape({
    id: yup.string(),
  })
  .defined()

export const GetAssetResponse: yup.ObjectSchema<GetAssetResponse> = RpcAssetSchema.defined()

routes.register<typeof GetAssetRequestSchema, GetAssetResponse>(
  `${ApiNamespace.chain}/getAsset`,
  GetAssetRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const id = Buffer.from(request.data.id, 'hex')

    if (id.byteLength !== ASSET_ID_LENGTH) {
      throw new ValidationError(
        `Asset identifier is invalid length, expected ${ASSET_ID_LENGTH} but got ${id.byteLength}`,
      )
    }

    const account = getAccount(node.wallet)
    const asset = await account.getAsset(id)

    if (!asset) {
      throw new NotFoundError(`No asset found with identifier ${request.data.id}`)
    }

    request.end({
      createdTransactionHash: asset.createdTransactionHash.toString('hex'),
      id: asset.id.toString('hex'),
      metadata: asset.metadata.toString('hex'),
      name: asset.name.toString('hex'),
      nonce: asset.nonce,
      creator: asset.creator.toString('hex'),
      owner: asset.owner.toString('hex'),
      supply: asset.supply ? CurrencyUtils.encode(asset.supply) : undefined,
      status: await node.wallet.getAssetStatus(account, asset),
      verification: node.assetsVerifier.verify(asset.id),
    })
  },
)
