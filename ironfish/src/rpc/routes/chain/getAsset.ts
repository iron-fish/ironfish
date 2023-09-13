/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ASSET_ID_LENGTH } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { CurrencyUtils } from '../../../utils'
import { NotFoundError, ValidationError } from '../../adapters'
import { RpcAsset } from '../../types'
import { ApiNamespace, routes } from '../router'

export type GetAssetRequest = {
  id: string
}

export type GetAssetResponse = Omit<RpcAsset, 'status'>

export const GetAssetRequestSchema: yup.ObjectSchema<GetAssetRequest> = yup
  .object()
  .shape({
    id: yup.string(),
  })
  .defined()

export const GetAssetResponse: yup.ObjectSchema<GetAssetResponse> = yup
  .object({
    id: yup.string().required(),
    metadata: yup.string().required(),
    name: yup.string().required(),
    nonce: yup.number().required(),
    creator: yup.string().required(),
    verification: yup
      .object({ status: yup.string().oneOf(['verified', 'unverified', 'unknown']).defined() })
      .defined(),
    // status: yup.string().defined(), // This field is the only difference between this object and RPCAsset
    supply: yup.string().optional(),
    owner: yup.string().defined(),
    createdTransactionHash: yup.string().defined(),
  })
  .defined()

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

    const asset = await node.chain.getAssetById(id)
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
      supply: CurrencyUtils.encode(asset.supply),
      verification: node.assetsVerifier.verify(asset.id),
    })
  },
)
