/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ASSET_IDENTIFIER_LENGTH } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { CurrencyUtils } from '../../../utils'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type GetAssetRequest = {
  identifier: string
}

export type GetAssetResponse = {
  createdTransactionHash: string
  identifier: string
  metadata: string
  name: string
  nonce: number
  owner: string
  supply: string
}

export const GetAssetRequestSchema: yup.ObjectSchema<GetAssetRequest> = yup
  .object()
  .shape({
    identifier: yup.string(),
  })
  .defined()

export const GetAssetResponse: yup.ObjectSchema<GetAssetResponse> = yup
  .object({
    createdTransactionHash: yup.string().defined(),
    identifier: yup.string().defined(),
    metadata: yup.string().defined(),
    name: yup.string().defined(),
    nonce: yup.number().defined(),
    owner: yup.string().defined(),
    supply: yup.string().defined(),
  })
  .defined()

router.register<typeof GetAssetRequestSchema, GetAssetResponse>(
  `${ApiNamespace.chain}/getAsset`,
  GetAssetRequestSchema,
  async (request, node): Promise<void> => {
    const identifier = Buffer.from(request.data.identifier, 'hex')

    if (identifier.byteLength !== ASSET_IDENTIFIER_LENGTH) {
      throw new ValidationError(
        `Asset identifier is invalid length, expected ${ASSET_IDENTIFIER_LENGTH} but got ${identifier.byteLength}`,
      )
    }

    const asset = await node.chain.getAssetById(identifier)

    if (!asset) {
      throw new ValidationError(`No asset found with identifier ${request.data.identifier}`)
    }

    request.end({
      createdTransactionHash: asset.createdTransactionHash.toString('hex'),
      identifier: asset.identifier.toString('hex'),
      metadata: asset.metadata.toString('hex'),
      name: asset.name.toString('hex'),
      nonce: asset.nonce,
      owner: asset.owner.toString('hex'),
      supply: CurrencyUtils.encode(asset.supply),
    })
  },
)
