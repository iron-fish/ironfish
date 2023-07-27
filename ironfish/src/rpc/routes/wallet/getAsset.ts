/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ASSET_ID_LENGTH } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { CurrencyUtils } from '../../../utils'
import { NotFoundError, ValidationError } from '../../adapters'
import { ApiNamespace, routes } from '../router'
import { getAccount } from './utils'

export type GetWalletAssetRequest = {
  account?: string
  confirmations?: number
  id: string
}

export type GetWalletAssetResponse = {
  createdTransactionHash: string
  creator: string
  id: string
  metadata: string
  name: string
  nonce: number
  status: string
  // Populated for assets the account owns
  supply: string | null
  // Populated once the asset has been added to the main chain
  blockHash: string | null
  sequence: number | null
}

export const GetWalletAssetRequestSchema: yup.ObjectSchema<GetWalletAssetRequest> = yup
  .object()
  .shape({
    account: yup.string().optional(),
    confirmations: yup.number().optional(),
    id: yup.string(),
  })
  .defined()

export const GetWalletAssetResponse: yup.ObjectSchema<GetWalletAssetResponse> = yup
  .object({
    createdTransactionHash: yup.string().defined(),
    creator: yup.string().defined(),
    id: yup.string().defined(),
    metadata: yup.string().defined(),
    name: yup.string().defined(),
    nonce: yup.number().defined(),
    status: yup.string().defined(),
    supply: yup.string().nullable().defined(),
    blockHash: yup.string().nullable().defined(),
    sequence: yup.number().nullable().defined(),
  })
  .defined()

routes.register<typeof GetWalletAssetRequestSchema, GetWalletAssetResponse>(
  `${ApiNamespace.wallet}/getAsset`,
  GetWalletAssetRequestSchema,
  async (request, { node }): Promise<void> => {
    Assert.isNotUndefined(node)

    const account = getAccount(node.wallet, request.data.account)

    const id = Buffer.from(request.data.id, 'hex')
    if (id.byteLength !== ASSET_ID_LENGTH) {
      throw new ValidationError(
        `Asset identifier is invalid length, expected ${ASSET_ID_LENGTH} but got ${id.byteLength}`,
      )
    }

    const asset = await account.getAsset(id)
    if (!asset) {
      throw new NotFoundError(`No asset found with identifier ${request.data.id}`)
    }

    request.end({
      createdTransactionHash: asset.createdTransactionHash.toString('hex'),
      creator: asset.creator.toString('hex'),
      id: asset.id.toString('hex'),
      metadata: asset.metadata.toString('hex'),
      name: asset.name.toString('hex'),
      nonce: asset.nonce,
      status: await node.wallet.getAssetStatus(account, asset, {
        confirmations: request.data.confirmations,
      }),
      supply: asset.supply ? CurrencyUtils.encode(asset.supply) : null,
      blockHash: asset.blockHash ? asset.blockHash.toString('hex') : null,
      sequence: asset.sequence ? asset.sequence : null,
    })
  },
)
